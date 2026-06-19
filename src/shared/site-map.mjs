const SITE_MAP_PAGE_ROUTE_PREFIXES = ["/user", "/staff", "/recruiting", "/training", "/admin"];

export const SITE_MAP_SECTIONS = [
  {
    id: "user",
    label: "User",
    path: "/user",
    icon: "user",
    visibility: { statuses: ["Active", "Pending"], allOf: ["accounts.view-self"] },
    pages: [
      {
        id: "user_profile",
        label: "User Profile",
        path: "/user/profile",
        icon: "profile",
        visibility: { statuses: ["Active", "Pending"], allOf: ["accounts.view-self"] },
      },
      {
        id: "user_application",
        label: "Application",
        path: "/user/application",
        icon: "applications",
        visibility: {
          statuses: ["Pending"],
          anyOf: ["applications.create-self", "applications.view-self"],
        },
      },
      {
        id: "user_leave",
        label: "Leave",
        path: "/user/leave",
        icon: "leave",
        visibility: { statuses: ["Active"], allOf: ["loa.create-self"] },
      },
      {
        id: "user_training",
        label: "Training",
        path: "/user/training",
        icon: "training",
        visibility: { statuses: ["Active"] },
        reserved: true,
      },
      {
        id: "user_events",
        label: "Events",
        path: "/user/events",
        icon: "events",
        visibility: { statuses: ["Active"], allOf: ["events.view-self"] },
      },
      {
        id: "user_support",
        label: "Support",
        path: "/user/support",
        icon: "support",
        visibility: { statuses: ["Active", "Pending"], allOf: ["support.create-self"] },
      },
    ],
  },
  {
    id: "staff",
    label: "Staff",
    path: "/staff",
    icon: "staff",
    visibility: { statuses: ["Active"], allOf: ["personnel.view-scoped"] },
    pages: [
      {
        id: "staff_personnel_management",
        label: "Personnel Management",
        path: "/staff/personnel-management",
        icon: "personnel",
        visibility: { statuses: ["Active"], allOf: ["personnel.view-scoped"] },
        subpages: [
          {
            id: "staff_personnel_management_qualifications",
            label: "Qualifications",
            path: "/staff/personnel-management/qualifications",
            icon: "qualifications",
            visibility: { statuses: ["Active"], allOf: ["personnel.update-scoped"] },
            reserved: true,
          },
          {
            id: "staff_personnel_management_promotions",
            label: "Promotions",
            path: "/staff/personnel-management/promotions",
            icon: "promotions",
            visibility: { statuses: ["Active"], allOf: ["personnel.update-scoped"] },
            reserved: true,
          },
          {
            id: "staff_personnel_management_awards",
            label: "Awards",
            path: "/staff/personnel-management/awards",
            icon: "awards",
            visibility: { statuses: ["Active"], allOf: ["personnel.update-scoped"] },
            reserved: true,
          },
          {
            id: "staff_personnel_management_leave",
            label: "Leave",
            path: "/staff/personnel-management/leave",
            icon: "leave",
            visibility: { statuses: ["Active"], allOf: ["loa.review-scoped"] },
            reserved: true,
          },
          {
            id: "staff_personnel_management_intake",
            label: "Intake",
            path: "/staff/personnel-management/intake",
            icon: "intake",
            visibility: { statuses: ["Active"], allOf: ["personnel.update-scoped"] },
            reserved: true,
          },
        ],
      },
      {
        id: "staff_applicant_review",
        label: "Applicant Review",
        path: "/staff/applicant-review",
        icon: "applications",
        visibility: { statuses: ["Active"], allOf: ["applications.review-target-unit"] },
      },
    ],
  },
  {
    id: "recruiting",
    label: "Recruiting",
    path: "/recruiting",
    icon: "recruiting",
    visibility: { statuses: ["Active"], allOf: ["applications.review-recruiter"] },
    pages: [
      {
        id: "recruiting_dashboard",
        label: "Dashboard",
        path: "/recruiting",
        icon: "dashboard",
        visibility: { statuses: ["Active"], allOf: ["applications.review-recruiter"] },
        reserved: true,
      },
      {
        id: "recruiting_applications",
        label: "Applications",
        path: "/recruiting/applications",
        icon: "applications",
        visibility: { statuses: ["Active"], allOf: ["applications.review-recruiter"] },
      },
    ],
  },
  {
    id: "training",
    label: "Training",
    path: "/training",
    icon: "training",
    visibility: { statuses: ["Active"], anyOf: ["training.view-scoped", "training.record-scoped"] },
    pages: [
      {
        id: "training_records",
        label: "Training Records",
        path: "/training",
        icon: "dashboard",
        visibility: {
          statuses: ["Active"],
          anyOf: ["training.view-scoped", "training.record-scoped"],
        },
      },
    ],
  },
  {
    id: "admin",
    label: "Admin",
    path: "/admin",
    icon: "admin",
    visibility: {
      statuses: ["Active"],
      anyOf: [
        "access.recovery.review",
        "access.sessions.revoke",
        "access.bootstrap.complete",
        "access.roles.manage",
      ],
    },
    pages: [
      {
        id: "admin_dashboard",
        label: "Dashboard",
        path: "/admin",
        icon: "dashboard",
        visibility: {
          statuses: ["Active"],
          anyOf: [
            "access.recovery.review",
            "access.sessions.revoke",
            "access.bootstrap.complete",
            "access.roles.manage",
          ],
        },
        reserved: true,
      },
      {
        id: "admin_roles",
        label: "Roles",
        path: "/admin/roles",
        icon: "admin",
        visibility: {
          statuses: ["Active"],
          allOf: ["access.roles.manage"],
        },
      },
    ],
  },
];

export function resolveVisibleNavigation(accountStatus, permissions) {
  const permissionSet = normalizePermissionSet(permissions);
  const sections = SITE_MAP_SECTIONS.map((section) => {
    if (!hasVisibility(section.visibility, accountStatus, permissionSet)) {
      return null;
    }

    const pages = section.pages
      .map((page) => {
        if (!hasVisibility(page.visibility, accountStatus, permissionSet)) {
          return null;
        }

        const subpages = (page.subpages ?? []).filter((subpage) =>
          hasVisibility(subpage.visibility, accountStatus, permissionSet),
        );

        return compactNavigationNode({
          ...page,
          sectionId: section.id,
          subpages,
        });
      })
      .filter(Boolean);

    if (!pages.length) {
      return null;
    }

    return compactNavigationNode({
      ...section,
      pages,
    });
  }).filter(Boolean);

  return {
    defaultPath: sections[0]?.pages[0]?.path ?? null,
    sections,
  };
}

export function findSiteMapNodeByPath(pathname) {
  const normalizedPath = normalizePath(pathname);

  for (const section of SITE_MAP_SECTIONS) {
    for (const page of section.pages) {
      if (normalizePath(page.path) === normalizedPath) {
        return { type: "page", section, page, node: page };
      }

      for (const subpage of page.subpages ?? []) {
        if (normalizePath(subpage.path) === normalizedPath) {
          return { type: "subpage", section, page, subpage, node: subpage };
        }
      }
    }
  }

  return findDynamicRouteNodeByPath(SITE_MAP_SECTIONS, normalizedPath);
}

export function findNavigationNodeByPath(navigation, pathname) {
  const normalizedPath = normalizePath(pathname);

  for (const section of navigation?.sections ?? []) {
    for (const page of section.pages ?? []) {
      if (normalizePath(page.path) === normalizedPath) {
        return { type: "page", section, page, node: page };
      }

      for (const subpage of page.subpages ?? []) {
        if (normalizePath(subpage.path) === normalizedPath) {
          return { type: "subpage", section, page, subpage, node: subpage };
        }
      }
    }
  }

  return findDynamicRouteNodeByPath(navigation?.sections ?? [], normalizedPath);
}

export function resolveSectionLandingPath(navigation, pathname) {
  const normalizedPath = normalizePath(pathname);
  const section = (navigation?.sections ?? []).find(
    (item) => normalizePath(item.path) === normalizedPath,
  );
  return section?.pages?.[0]?.path ?? null;
}

export function isSectionDashboardMatch(match) {
  return Boolean(
    match?.type === "page" &&
    match.node?.id?.endsWith("_dashboard") &&
    match.node?.icon === "dashboard" &&
    normalizePath(match.node?.path) === normalizePath(match.section?.path),
  );
}

export function isSiteMapRoute(pathname) {
  const normalizedPath = normalizePath(pathname);
  return (
    normalizedPath === "/" ||
    SITE_MAP_PAGE_ROUTE_PREFIXES.some(
      (prefix) => normalizedPath === prefix || normalizedPath.startsWith(`${prefix}/`),
    )
  );
}

export function parseSiteMapText(text) {
  return {
    sections: extractKeyBlock(text, "SECTION KEYS:", "PAGES:").map(normalizeSiteMapKey),
    pages: extractKeyBlock(text, "PAGE KEYS:", "SUBPAGES:").map(normalizeSiteMapKey),
    subpages: extractKeyBlock(text, "SUBPAGE KEYS").map(normalizeSiteMapKey),
  };
}

export function validateSiteMapText(text) {
  const parsed = parseSiteMapText(text);
  const implementation = {
    sections: SITE_MAP_SECTIONS.map((section) => section.id),
    pages: SITE_MAP_SECTIONS.flatMap((section) => section.pages.map((page) => page.id)),
    subpages: SITE_MAP_SECTIONS.flatMap((section) =>
      section.pages.flatMap((page) => (page.subpages ?? []).map((subpage) => subpage.id)),
    ),
  };
  const errors = [
    ...diffKeyList("sections", parsed.sections, implementation.sections),
    ...diffKeyList("pages", parsed.pages, implementation.pages),
    ...diffKeyList("subpages", parsed.subpages, implementation.subpages),
  ];

  return {
    ok: errors.length === 0,
    errors,
    parsed,
    implementation,
  };
}

export function normalizeSiteMapKey(value) {
  return String(value ?? "")
    .trim()
    .replace(/dashbaord/gi, "dashboard")
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replace(/[^a-zA-Z0-9_]+/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_+|_+$/g, "")
    .toLowerCase();
}

function compactNavigationNode(node) {
  const result = {
    id: node.id,
    label: node.label,
    path: node.path,
    icon: node.icon,
  };

  if (node.sectionId) {
    result.sectionId = node.sectionId;
  }

  if (node.reserved) {
    result.reserved = true;
  }

  if (node.pages) {
    result.pages = node.pages;
  }

  if (node.subpages) {
    result.subpages = node.subpages.map((subpage) => compactNavigationNode(subpage));
  }

  return result;
}

function hasVisibility(visibility, accountStatus, permissionSet) {
  if (visibility?.statuses && !visibility.statuses.includes(accountStatus)) {
    return false;
  }

  if (visibility?.allOf?.some((permission) => !permissionSet.has(permission))) {
    return false;
  }

  if (
    visibility?.anyOf?.length &&
    !visibility.anyOf.some((permission) => permissionSet.has(permission))
  ) {
    return false;
  }

  return true;
}

function normalizePermissionSet(permissions) {
  if (permissions instanceof Set) {
    return permissions;
  }

  return new Set(
    (permissions ?? [])
      .map((permission) => (typeof permission === "string" ? permission : permission?.key))
      .filter(Boolean),
  );
}

function normalizePath(pathname) {
  const path =
    String(pathname ?? "/")
      .split("?")[0]
      .split("#")[0] || "/";
  return path.length > 1 ? path.replace(/\/+$/g, "") : path;
}

function findDynamicRouteNodeByPath(sections, normalizedPath) {
  const staffPersonnelDetailMatch = /^\/staff\/personnel-management\/([^/]+)$/.exec(normalizedPath);
  if (staffPersonnelDetailMatch) {
    const section = sections.find((item) => item.id === "staff");
    const page = section?.pages?.find((item) => item.id === "staff_personnel_management");
    if (!section || !page) {
      return null;
    }

    return {
      type: "detail",
      section,
      page,
      node: {
        ...compactNavigationNode({
          ...page,
          id: "staff_personnel_profile_detail",
          label: "Personnel Profile",
          path: normalizedPath,
        }),
        parentPageId: page.id,
      },
      params: {
        personnelId: decodeURIComponent(staffPersonnelDetailMatch[1]),
      },
    };
  }

  const staffApplicantDetailMatch = /^\/staff\/applicant-review\/([^/]+)$/.exec(normalizedPath);
  if (staffApplicantDetailMatch) {
    const section = sections.find((item) => item.id === "staff");
    const page = section?.pages?.find((item) => item.id === "staff_applicant_review");
    if (!section || !page) {
      return null;
    }

    return {
      type: "detail",
      section,
      page,
      node: {
        ...compactNavigationNode({
          ...page,
          id: "staff_applicant_review_detail",
          label: "Applicant Detail",
          path: normalizedPath,
        }),
        parentPageId: page.id,
      },
      params: {
        applicationId: decodeURIComponent(staffApplicantDetailMatch[1]),
      },
    };
  }

  const applicationDetailMatch = /^\/recruiting\/applications\/([^/]+)$/.exec(normalizedPath);
  if (!applicationDetailMatch) {
    return null;
  }

  const section = sections.find((item) => item.id === "recruiting");
  const page = section?.pages?.find((item) => item.id === "recruiting_applications");
  if (!section || !page) {
    return null;
  }

  return {
    type: "detail",
    section,
    page,
    node: {
      ...compactNavigationNode({
        ...page,
        id: "recruiting_application_detail",
        label: "Application Detail",
        path: normalizedPath,
      }),
      parentPageId: page.id,
    },
    params: {
      applicationId: decodeURIComponent(applicationDetailMatch[1]),
    },
  };
}

function extractKeyBlock(text, startMarker, endMarker) {
  const startIndex = text.indexOf(startMarker);
  if (startIndex === -1) return [];

  const contentStart = startIndex + startMarker.length;
  const endIndex = endMarker ? text.indexOf(endMarker, contentStart) : -1;
  const block = text.slice(contentStart, endIndex === -1 ? undefined : endIndex);

  return block
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => /^[a-zA-Z0-9_]+$/.test(line));
}

function diffKeyList(label, sourceKeys, implementationKeys) {
  const source = new Set(sourceKeys);
  const implementation = new Set(implementationKeys);
  const missing = [...source].filter((key) => !implementation.has(key));
  const extra = [...implementation].filter((key) => !source.has(key));

  return [
    ...missing.map((key) => `Missing ${label} key in implementation: ${key}`),
    ...extra.map((key) => `Extra ${label} key not listed in SITE_MAP.TXT: ${key}`),
  ];
}
