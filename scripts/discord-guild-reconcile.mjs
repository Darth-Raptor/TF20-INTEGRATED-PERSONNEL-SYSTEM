import { reconcileDiscordGuildMembers } from "../src/server/services/discord-guild-sync.js";

async function main() {
  const result = await reconcileDiscordGuildMembers();
  console.log(
    JSON.stringify(
      {
        ok: true,
        guildId: result.guildId,
        guildName: result.guildName,
        checkedUsers: result.checkedUsers,
        currentMembers: result.currentMembers,
        disabled: result.disabled,
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
