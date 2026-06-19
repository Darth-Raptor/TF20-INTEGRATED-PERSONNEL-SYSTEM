import { personDisplayName } from "../shared/display-labels.mjs";

const DISCORD_PROVIDER = "Discord";
const DEFAULT_BRIDGE_TIMEOUT_MS = 8000;
const DEFAULT_DISPATCH_INTERVAL_MS = 15000;
const DEFAULT_BATCH_SIZE = 10;
const DEFAULT_MAX_ATTEMPTS = 8;

export const DISCORD_RECRUITING_EVENTS = {
  APPLICATION_SUBMITTED: "application_submitted",
  APPLICATION_RESUBMITTED: "application_resubmitted",
  APPLICATION_CLAIMED: "application_claimed",
  TARGET_UNIT_REVIEW_COMPLETED: "target_unit_review_completed",
};

export async function queueDiscordRecruitingEvent({
  tx,
  eventType,
  application,
  occurredAt = new Date(),
  idempotencyKey,
}) {
  if (!application?.id) {
    return null;
  }

  const payload = buildDiscordRecruitingEventPayload(application, eventType, occurredAt);
  const key =
    idempotencyKey ?? `application:${application.id}:${eventType}:${occurredAt.toISOString()}`;

  return tx.discordDeliveryJob.upsert({
    where: { idempotencyKey: key },
    update: {},
    create: {
      eventType,
      idempotencyKey: key,
      payload,
      nextAttemptAt: occurredAt,
    },
  });
}

export function buildDiscordRecruitingEventPayload(
  application,
  eventType,
  occurredAt = new Date(),
) {
  const applicantIdentity = discordIdentityForAccount(application.account);
  const recruiterIdentity = discordIdentityForAccount(application.claimedByAccount);
  const applicantName = applicationDisplayName(application);
  const applicationUrl = `/recruiting/applications/${encodeURIComponent(application.id)}`;

  return {
    eventType,
    applicationId: application.id,
    applicationStatus: application.status,
    applicationUrl,
    applicantName,
    applicantDiscordId: applicantIdentity?.providerAccountId ?? null,
    applicantDiscordUsername: applicantIdentity?.username ?? null,
    applicantDisplayName: personDisplayName(
      { fullName: application.account?.displayName },
      applicantName,
    ),
    recruiterAccountId: application.claimedByAccountId ?? null,
    recruiterDiscordId: recruiterIdentity?.providerAccountId ?? null,
    recruiterDiscordUsername: recruiterIdentity?.username ?? null,
    recruiterDisplayName: application.claimedByAccount
      ? personDisplayName({ fullName: application.claimedByAccount.displayName })
      : null,
    targetUnitName: application.targetUnit?.name ?? null,
    discordRecruitingThreadId: application.discordRecruitingThreadId ?? null,
    occurredAt: occurredAt.toISOString(),
  };
}

export async function dispatchDueDiscordDeliveryJobs(prisma, config, options = {}) {
  const bridge = config.discordRecruitingBridge ?? {};
  if (!bridge.enabled) {
    return { attempted: 0, delivered: 0, failed: 0, skipped: true };
  }

  const now = new Date();
  const batchSize = options.batchSize ?? bridge.batchSize ?? DEFAULT_BATCH_SIZE;
  const jobs = await prisma.discordDeliveryJob.findMany({
    where: {
      status: { in: ["Pending", "Failed"] },
      nextAttemptAt: { lte: now },
    },
    orderBy: [{ nextAttemptAt: "asc" }, { createdAt: "asc" }],
    take: batchSize,
  });

  const summary = { attempted: 0, delivered: 0, failed: 0, skipped: false };
  for (const job of jobs) {
    summary.attempted += 1;
    const result = await dispatchDiscordDeliveryJob(prisma, config, job);
    if (result.ok) {
      summary.delivered += 1;
    } else {
      summary.failed += 1;
    }
  }

  return summary;
}

export function startDiscordDeliveryDispatcher({ prisma, config }) {
  const bridge = config.discordRecruitingBridge ?? {};
  if (!bridge.enabled) {
    return { stop() {}, runOnce: () => Promise.resolve({ skipped: true }) };
  }

  let running = false;
  let stopped = false;
  const intervalMs = bridge.intervalMs ?? DEFAULT_DISPATCH_INTERVAL_MS;

  const runOnce = async () => {
    if (running || stopped) return { skipped: true };
    running = true;
    try {
      return await dispatchDueDiscordDeliveryJobs(prisma, config);
    } catch (error) {
      console.error("Discord recruiting delivery dispatch failed.", error);
      return { attempted: 0, delivered: 0, failed: 1, skipped: false };
    } finally {
      running = false;
    }
  };

  const interval = setInterval(() => {
    void runOnce();
  }, intervalMs);
  void runOnce();

  return {
    runOnce,
    stop() {
      stopped = true;
      clearInterval(interval);
    },
  };
}

async function dispatchDiscordDeliveryJob(prisma, config, job) {
  const bridge = config.discordRecruitingBridge;
  const attemptNumber = job.attempts + 1;

  try {
    const response = await postBridgeEvent(bridge, job.payload);
    await prisma.$transaction(async (tx) => {
      await tx.discordDeliveryJob.update({
        where: { id: job.id },
        data: {
          attempts: attemptNumber,
          status: "Delivered",
          deliveredAt: new Date(),
          lastError: null,
        },
      });

      await recordIntegrationAttempt(tx, job, "Success", response);
      const threadId = response?.threadId ? String(response.threadId) : "";
      if (threadId && job.eventType === DISCORD_RECRUITING_EVENTS.APPLICATION_CLAIMED) {
        await tx.application.update({
          where: { id: job.payload.applicationId },
          data: {
            discordRecruitingThreadId: threadId,
            discordRecruitingThreadCreatedAt: new Date(),
          },
        });
      }
    });
    return { ok: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Discord bridge delivery failed.";
    const dead = attemptNumber >= (bridge.maxAttempts ?? DEFAULT_MAX_ATTEMPTS);
    await prisma.$transaction(async (tx) => {
      await tx.discordDeliveryJob.update({
        where: { id: job.id },
        data: {
          attempts: attemptNumber,
          status: dead ? "Dead" : "Failed",
          nextAttemptAt: retryAfter(attemptNumber),
          lastError: message,
        },
      });

      await recordIntegrationAttempt(tx, job, "Failure", { error: message });
    });
    return { ok: false, error: message };
  }
}

async function postBridgeEvent(bridge, payload) {
  if (!bridge.url || !bridge.secret) {
    throw new Error("Discord recruiting bridge URL and secret are required when enabled.");
  }

  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    bridge.timeoutMs ?? DEFAULT_BRIDGE_TIMEOUT_MS,
  );

  try {
    const response = await fetch(bridge.url, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${bridge.secret}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    });

    const responseText = await response.text();
    const responsePayload = parseJson(responseText);
    if (!response.ok) {
      throw new Error(
        `Discord bridge returned HTTP ${response.status}: ${responsePayload?.error ?? responseText}`,
      );
    }
    return responsePayload ?? {};
  } finally {
    clearTimeout(timeout);
  }
}

async function recordIntegrationAttempt(tx, job, status, responsePayload) {
  await tx.integrationLog.create({
    data: {
      provider: DISCORD_PROVIDER,
      action: `recruiting-event:${job.eventType}`,
      status,
      accountId: job.payload?.recruiterAccountId ?? null,
      relatedRecordType: "Application",
      relatedRecordId: job.payload?.applicationId ?? null,
      requestPayload: job.payload,
      responsePayload: status === "Success" ? responsePayload : null,
      error: status === "Failure" ? (responsePayload?.error ?? "Discord delivery failed.") : null,
    },
  });
}

function retryAfter(attemptNumber) {
  const delayMinutes = Math.min(60, 2 ** Math.max(0, attemptNumber - 1));
  return new Date(Date.now() + delayMinutes * 60 * 1000);
}

function parseJson(text) {
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function discordIdentityForAccount(account) {
  return (account?.authIdentities ?? []).find(
    (identity) => identity.provider === DISCORD_PROVIDER && !identity.unlinkedAt,
  );
}

function applicationDisplayName(application) {
  return personDisplayName(
    {
      firstName: application?.firstName,
      lastName: application?.lastName,
      fullName: application?.account?.displayName,
    },
    "Applicant",
  );
}
