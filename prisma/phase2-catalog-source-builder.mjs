export function buildCatalogSource(source) {
  const rolesByKey = new Map(source.roles.map((role) => [role.key, role]));
  const permissionKeysByRole = derivePermissionKeysByRole(source.roles, source.permissions, rolesByKey);

  return {
    version: "2026-06-04-phase2-subpass3",
    metadata: {
      description: "Authoritative TF20 catalog source generated from the approved Phase 2 review CSVs.",
      policy: "Catalog changes are repo-driven, additive by default, and non-destructive for referenced records.",
      generatedFrom: "phase two review files",
      enumDisplayLabels: buildEnumDisplayLabels(source.enumDisplayMappings),
    },
    roles: source.roles.map((role) => ({
      key: role.key,
      name: role.displayName,
      description: roleDescription(role.key),
      precedence: role.precedence,
      status: "Active",
      permissionKeys: permissionKeysByRole.get(role.key) ?? [],
    })),
    permissions: source.permissions.map((permission) => ({
      key: permission.key,
      module: permissionModule(permission.key),
      action: permissionAction(permission.key),
      name: permission.displayName,
      description: null,
      sensitiveCategory: permissionSensitiveCategory(permission.key),
      requiresRecentAuth: permissionRequiresRecentAuth(permission.key),
      status: "Active",
    })),
    units: source.units.map((unit) => ({
      key: unit.key,
      name: unit.displayName,
      type: unit.type,
      parentKey: unit.parentKey,
      hierarchyBase: unit.hierarchyBase,
      status: "Active",
    })),
    ranks: source.ranks.map((rank) => ({
      key: rank.key,
      name: rank.displayName,
      abbreviation: rank.abbreviation,
      grade: rank.grade,
      precedence: rank.precedence,
      status: "Active",
    })),
    billets: source.billets.map((billet) => ({
      key: billet.key,
      unitKey: billet.unitKey,
      minimumRankKey: billet.minimumRankKey,
      commandPrecedence: billet.commandPrecedence,
      name: billet.displayName,
      category: billet.category,
      status: "Active",
    })),
    staffSections: source.staffSelections.map((section) => ({
      key: section.key,
      identifier: section.identifier,
      name: section.name,
      function: section.function,
      status: "Active",
    })),
    mos: source.mos.map((entry) => ({
      key: entry.key,
      identifier: entry.identifier,
      name: entry.name,
      unitKey: entry.unitKey,
      status: "Active",
    })),
    trainingCourses: source.trainingCourses.map((course) => ({
      key: course.key,
      name: course.name,
      category: null,
      description: null,
      status: "Active",
    })),
    qualifications: source.qualifications.map((qualification) => ({
      key: qualification.key,
      name: qualification.name,
      category: null,
      expiresAfterDays: null,
      status: "Active",
    })),
    awards: source.awards.map((award) => ({
      key: award.key,
      abbreviation: award.abbreviation,
      name: award.name,
      type: award.type,
      category: award.category,
      status: "Active",
    })),
  };
}

export function formatCatalogSourceModule(catalogSource) {
  return `export const catalogSource = ${JSON.stringify(catalogSource, null, 2)};\n`;
}

function derivePermissionKeysByRole(roles, permissions, rolesByKey) {
  const permissionKeysByRole = new Map(roles.map((role) => [role.key, []]));

  for (const permission of permissions) {
    const minimumRole = rolesByKey.get(permission.minimumRoleKey);
    if (!minimumRole) {
      throw new Error(`Missing minimum role ${permission.minimumRoleKey} for permission ${permission.key}.`);
    }

    for (const role of roles) {
      const getsPermission =
        role.key === minimumRole.key ||
        role.precedence > minimumRole.precedence;

      if (!getsPermission) continue;
      permissionKeysByRole.get(role.key).push(permission.key);
    }
  }

  for (const keys of permissionKeysByRole.values()) {
    keys.sort();
  }

  return permissionKeysByRole;
}

function buildEnumDisplayLabels(mappings) {
  const labels = {};

  for (const mapping of mappings) {
    if (!mapping.needsDisplayMapping) continue;
    labels[mapping.enumName] ??= {};
    labels[mapping.enumName][mapping.normalizedValue] = mapping.displayValue;
  }

  return labels;
}

function permissionModule(permissionKey) {
  return permissionKey.split(".")[0] ?? permissionKey;
}

function permissionAction(permissionKey) {
  return permissionKey.split(".").slice(1).join("-") || "view";
}

function permissionSensitiveCategory(permissionKey) {
  if (permissionKey.startsWith("access.recovery.")) return "recovery";
  if (
    permissionKey === "access.sessions.revoke" ||
    permissionKey === "access.bootstrap.complete" ||
    permissionKey === "catalogs.manage"
  ) {
    return "access-management";
  }
  if (permissionKey.startsWith("loa.")) return "private-loa";
  if (permissionKey.startsWith("serviceRecords.")) return "disciplinary";
  if (permissionKey.startsWith("audit.")) return "audit";
  if (permissionKey.startsWith("integrations.")) return "integration";
  return null;
}

function permissionRequiresRecentAuth(permissionKey) {
  const exactMatches = new Set([
    "access.recovery.review",
    "access.sessions.revoke",
    "access.bootstrap.complete",
    "catalogs.manage",
    "applications.review-recruiter",
    "applications.review-target-unit",
    "personnel.update-scoped",
    "events.manage-scoped",
    "attendance.review-scoped",
    "loa.review-scoped",
    "training.record-scoped",
    "serviceRecords.manage-scoped",
    "support.manage-queue",
    "audit.view",
    "integrations.view",
    "integrations.manage",
  ]);

  return exactMatches.has(permissionKey);
}

function roleDescription(roleKey) {
  const descriptions = {
    "pending-user": "Guild-verified pending account with limited applicant and recovery access.",
    member: "Active member baseline access.",
    recruiter: "Recruiting workflow authority.",
    trainer: "Training and qualification authority.",
    "unit-staff": "Scoped personnel and workflow authority for unit staff.",
    "command-staff": "Elevated command oversight authority.",
    "system-admin": "System-wide administration and recovery authority.",
  };

  return descriptions[roleKey] ?? null;
}
