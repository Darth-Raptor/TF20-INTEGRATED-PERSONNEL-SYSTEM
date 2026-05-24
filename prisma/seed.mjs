import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  await assertNoVerifiedCatalogSeed();
  console.log("Foundation seed complete: no official catalog values are seeded until user verification.");
}

async function assertNoVerifiedCatalogSeed() {
  const catalogCounts = await Promise.all([
    prisma.role.count(),
    prisma.permission.count(),
    prisma.unit.count(),
    prisma.rank.count(),
    prisma.billet.count(),
    prisma.staffSection.count(),
    prisma.specialty.count(),
  ]);

  const existingCount = catalogCounts.reduce((total, count) => total + count, 0);
  if (existingCount > 0) {
    console.log(`Foundation seed left ${existingCount} existing catalog records unchanged.`);
  }
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });
