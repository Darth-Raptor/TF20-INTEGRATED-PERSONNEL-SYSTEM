import { backfillDiscordGuildMembers } from "../src/server/services/discord-guild-sync.js";

async function main() {
  const result = await backfillDiscordGuildMembers();
  console.log(
    JSON.stringify(
      {
        ok: true,
        guildId: result.guildId,
        guildName: result.guildName,
        processed: result.processed,
      },
      null,
      2,
    ),
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
