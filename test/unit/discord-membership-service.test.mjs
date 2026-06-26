import assert from "node:assert/strict";
import { test } from "node:test";

import {
  buildGuildRosterBackfillEventId,
  buildOAuthBackfillEventId,
  extractDiscordGuildJoinedAt,
  mapDiscordMembershipEventToTimelineEntry,
  normalizeDiscordMembershipEventPayload,
} from "../../src/server/discord-membership-service.mjs";

test("discord membership ingest payload validation rejects missing and invalid values", () => {
  const missing = normalizeDiscordMembershipEventPayload({});
  assert.equal(missing.ok, false);
  assert.equal(missing.code, "validation_error");

  const invalidDate = normalizeDiscordMembershipEventPayload({
    eventId: "evt-1",
    eventType: "join",
    discordUserId: "123",
    guildId: "guild",
    occurredAt: "not-a-date",
  });
  assert.equal(invalidDate.ok, false);
  assert.equal(invalidDate.code, "validation_error");
});

test("discord membership helpers normalize events and timeline labels", () => {
  const normalized = normalizeDiscordMembershipEventPayload({
    eventId: "evt-join-1",
    eventType: "join",
    discordUserId: "123",
    guildId: "guild",
    occurredAt: "2026-06-20T14:30:00.000Z",
    username: "tester",
  });

  assert.equal(normalized.ok, true);
  assert.equal(normalized.data.eventType, "Join");
  assert.equal(normalized.data.providerAccountId, "123");

  const timelineEntry = mapDiscordMembershipEventToTimelineEntry({
    id: "event-1",
    eventType: "Leave",
    occurredAt: new Date("2026-06-21T12:00:00.000Z"),
  });
  assert.equal(timelineEntry.displayLabel, "Discord Server - Left");
  assert.equal(timelineEntry.reason, "Discord account left the server.");
});

test("oauth fallback event IDs are deterministic and joined_at metadata parses cleanly", () => {
  const occurredAt = extractDiscordGuildJoinedAt({ joined_at: "2026-06-13T00:00:00.000Z" });
  assert.ok(occurredAt);

  const eventId = buildOAuthBackfillEventId({
    guildId: "guild",
    providerAccountId: "123",
    occurredAt,
  });
  assert.equal(eventId, "oauth-joined-at:guild:123:2026-06-13T00:00:00.000Z");

  const rosterEventId = buildGuildRosterBackfillEventId({
    guildId: "guild",
    providerAccountId: "123",
    occurredAt,
  });
  assert.equal(rosterEventId, "guild-roster-backfill:guild:123:2026-06-13T00:00:00.000Z");
});
