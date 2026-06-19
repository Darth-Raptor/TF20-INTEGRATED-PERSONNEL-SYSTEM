import { pathToFileURL } from "node:url";

import { PrismaClient } from "@prisma/client";

export const REMOVED_PERSONNEL_STATUSES = [
  "Probationary",
  "Inactive",
  "Separated",
  "Discharged",
  "DoNotRehire",
];

export function summarizeRemovedPersonnelStatusRows({ profiles = [], history = [] } = {}) {
  return {
    profiles,
    history,
    count: profiles.length + history.length,
  };
}

export async function findRemovedPersonnelStatusRows(prisma) {
  const statusList = REMOVED_PERSONNEL_STATUSES.map((status) => `'${status}'`).join(", ");
  const [profiles, history] = await Promise.all([
    prisma.$queryRawUnsafe(
      `SELECT id, accountId, status FROM PersonnelProfile WHERE status IN (${statusList}) ORDER BY id`,
    ),
    prisma.$queryRawUnsafe(
      `SELECT id, personnelProfileId, oldStatus, newStatus FROM PersonnelStatusHistory WHERE oldStatus IN (${statusList}) OR newStatus IN (${statusList}) ORDER BY id`,
    ),
  ]);

  return summarizeRemovedPersonnelStatusRows({ profiles, history });
}

async function main() {
  const prisma = new PrismaClient();
  try {
    const result = await findRemovedPersonnelStatusRows(prisma);
    if (!result.count) {
      console.log("No personnel records use retired statuses.");
      return;
    }

    console.error(`Retired personnel statuses remain in ${result.count} record(s).`);
    for (const profile of result.profiles) {
      console.error(`- PersonnelProfile ${profile.id}: ${profile.status}`);
    }
    for (const entry of result.history) {
      console.error(
        `- PersonnelStatusHistory ${entry.id}: ${entry.oldStatus ?? "null"} -> ${entry.newStatus}`,
      );
    }
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

const isEntrypoint = process.argv[1]
  ? import.meta.url === pathToFileURL(process.argv[1]).href
  : false;
if (isEntrypoint) {
  await main();
}
