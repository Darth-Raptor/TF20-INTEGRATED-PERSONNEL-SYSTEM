import { pathToFileURL } from "node:url";

import { PrismaClient } from "@prisma/client";

import { backfillPendingDiscordAccountsFromMembershipEvents } from "../src/server/discord-membership-service.mjs";

async function main(argv = process.argv.slice(2)) {
  const apply = argv.includes("--apply");
  const prisma = new PrismaClient();

  try {
    const summary = await backfillPendingDiscordAccountsFromMembershipEvents({
      prisma,
      apply,
    });
    console.log(JSON.stringify(summary, null, 2));
  } finally {
    await prisma.$disconnect();
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}
