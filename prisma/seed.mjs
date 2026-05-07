import { PrismaClient } from "@prisma/client";

import { standardBilletDefinitions, unitDefinitions, unitNameForKey } from "../src/server/services/unit-hierarchy.js";

const prisma = new PrismaClient();

const permissions = [
  { key: "applications:read", description: "View recruiting applications and pipeline metadata." },
  { key: "applications:write", description: "Update recruiting application status, notes, and conversion steps." },
  { key: "personnel:read", description: "View personnel roster and non-restricted personnel profile data." },
  { key: "personnel:write", description: "Update personnel profile, assignment, rank, billet, and status records." },
  { key: "audit:read", description: "View audit log entries." },
  { key: "audit:write", description: "Create audit log entries for staff actions." },
  { key: "discord:sync", description: "Queue and review Discord role synchronization work." },
  { key: "system:admin", description: "Manage technical system settings and integrations." },
];

const roles = [
  {
    name: "Applicant",
    description: "Default role for Discord-linked applicants before acceptance.",
    permissions: [],
  },
  {
    name: "Member",
    description: "Standard unit member access after acceptance.",
    permissions: [],
  },
  {
    name: "Recruiter",
    description: "Recruiting team access for application review.",
    permissions: ["applications:read", "applications:write", "audit:write"],
  },
  {
    name: "Staff",
    description: "Administrative staff access for routine personnel management.",
    permissions: [
      "applications:read",
      "applications:write",
      "personnel:read",
      "personnel:write",
      "audit:read",
      "audit:write",
      "discord:sync",
    ],
  },
  {
    name: "Command Staff",
    description: "Command authority for personnel and application decisions.",
    permissions: [
      "applications:read",
      "applications:write",
      "personnel:read",
      "personnel:write",
      "audit:read",
      "audit:write",
      "discord:sync",
    ],
  },
  {
    name: "System Admin",
    description: "Full technical administration role for portal access, user roles, and system workflows.",
    permissions: [
      "applications:read",
      "applications:write",
      "personnel:read",
      "personnel:write",
      "audit:read",
      "audit:write",
      "discord:sync",
      "system:admin",
    ],
  },
];

async function main() {
  const permissionsByKey = new Map();

  for (const permission of permissions) {
    const record = await prisma.permission.upsert({
      where: { key: permission.key },
      update: { description: permission.description },
      create: permission,
    });
    permissionsByKey.set(record.key, record);
  }

  for (const roleDefinition of roles) {
    const role = await prisma.role.upsert({
      where: { name: roleDefinition.name },
      update: { description: roleDefinition.description },
      create: {
        name: roleDefinition.name,
        description: roleDefinition.description,
      },
    });

    for (const permissionKey of roleDefinition.permissions) {
      const permission = permissionsByKey.get(permissionKey);
      if (!permission) continue;

      await prisma.rolePermission.upsert({
        where: {
          roleId_permissionId: {
            roleId: role.id,
            permissionId: permission.id,
          },
        },
        update: {},
        create: {
          roleId: role.id,
          permissionId: permission.id,
        },
      });
    }
  }

  const unitMap = new Map();

  for (const unitDefinition of unitDefinitions) {
    const parent = unitDefinition.parentKey ? unitMap.get(unitNameForKey(unitDefinition.parentKey)) : null;
    const unit = await prisma.unit.findFirst({
      where: { name: unitDefinition.name },
      select: { id: true, name: true },
    });

    const data = {
      name: unitDefinition.name,
      type: unitDefinition.type,
      parentId: parent?.id || null,
      sortOrder: unitDefinition.sortOrder || 0,
      isActive: true,
    };

    const record = unit
      ? await prisma.unit.update({
          where: { id: unit.id },
          data,
          select: { id: true, name: true },
        })
      : await prisma.unit.create({
          data,
          select: { id: true, name: true },
        });

    unitMap.set(record.name, record);
  }

  const billetCategoryMap = new Map();
  for (const categoryName of [...new Set(standardBilletDefinitions.map((billet) => billet.category))]) {
    const category = await prisma.billetCategory.upsert({
      where: { name: categoryName },
      update: {},
      create: { name: categoryName },
      select: { id: true, name: true },
    });
    billetCategoryMap.set(category.name, category);
  }

  for (const billetDefinition of standardBilletDefinitions) {
    const unitName = unitNameForKey(billetDefinition.unitKey);
    const unit = unitName ? unitMap.get(unitName) : null;
    const category = billetCategoryMap.get(billetDefinition.category);

    if (!unit || !category) continue;

    const existing = await prisma.billet.findFirst({
      where: {
        unitId: unit.id,
        name: billetDefinition.name,
      },
      select: { id: true },
    });

    if (existing) {
      await prisma.billet.update({
        where: { id: existing.id },
        data: {
          categoryId: category.id,
          unitId: unit.id,
          name: billetDefinition.name,
        },
      });
      continue;
    }

    await prisma.billet.create({
      data: {
        categoryId: category.id,
        unitId: unit.id,
        name: billetDefinition.name,
      },
    });
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
