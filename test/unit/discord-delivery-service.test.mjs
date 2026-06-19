import assert from "node:assert/strict";
import { test } from "node:test";

import {
  DISCORD_RECRUITING_EVENTS,
  buildDiscordRecruitingEventPayload,
  dispatchDueDiscordDeliveryJobs,
} from "../../src/server/discord-delivery-service.mjs";

test("discord recruiting payload includes applicant, recruiter, thread, and URL data", () => {
  const payload = buildDiscordRecruitingEventPayload(
    {
      id: "application-1",
      status: "Submitted",
      firstName: "Alex",
      lastName: "Carter",
      claimedByAccountId: "recruiter-account",
      discordRecruitingThreadId: "thread-1",
      account: {
        displayName: "alex",
        authIdentities: [
          {
            provider: "Discord",
            providerAccountId: "applicant-discord",
            username: "alexcarter",
          },
        ],
      },
      claimedByAccount: {
        displayName: "Recruiter One",
        authIdentities: [
          {
            provider: "Discord",
            providerAccountId: "recruiter-discord",
            username: "recruiterone",
          },
        ],
      },
      targetUnit: { name: "A CO, 1/75th Ranger Regiment" },
    },
    DISCORD_RECRUITING_EVENTS.APPLICATION_CLAIMED,
    new Date("2026-06-15T20:30:00.000Z"),
  );

  assert.equal(payload.eventType, "application_claimed");
  assert.equal(payload.applicationId, "application-1");
  assert.equal(payload.applicantName, "A. Carter");
  assert.equal(payload.applicantDiscordId, "applicant-discord");
  assert.equal(payload.recruiterDiscordId, "recruiter-discord");
  assert.equal(payload.targetUnitName, "A CO, 1/75th Ranger Regiment");
  assert.equal(payload.discordRecruitingThreadId, "thread-1");
  assert.equal(payload.applicationUrl, "/recruiting/applications/application-1");
});

test("discord delivery dispatcher is inert when the bridge is disabled", async () => {
  const result = await dispatchDueDiscordDeliveryJobs(
    {
      discordDeliveryJob: {
        findMany() {
          throw new Error("disabled dispatcher should not query jobs");
        },
      },
    },
    { discordRecruitingBridge: { enabled: false } },
  );

  assert.deepEqual(result, { attempted: 0, delivered: 0, failed: 0, skipped: true });
});
