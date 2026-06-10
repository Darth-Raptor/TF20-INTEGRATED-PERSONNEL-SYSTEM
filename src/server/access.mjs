import { resolveVisibleNavigation } from "../shared/site-map.mjs";

export function buildAccessContext({ account, permissions }) {
  const permissionSet = new Set(permissions.map((permission) => permission.key));

  return {
    accountStatus: account.status,
    permissions: permissionSet,
    gateState: resolveGateState(account.status),
    visibleModules: resolveVisibleModules(account.status, permissionSet),
    visibleNavigation: resolveVisibleNavigation(account.status, permissionSet),
  };
}

export function resolveGateState(accountStatus) {
  switch (accountStatus) {
    case "Active":
      return "active";
    case "Pending":
      return "pending";
    case "Locked":
      return "locked";
    case "Disabled":
      return "disabled";
    case "Archived":
      return "archived";
    default:
      return "blocked";
  }
}

export function resolveVisibleModules(accountStatus, permissionSet) {
  if (accountStatus === "Pending") {
    return ["applications", "support", "access", "notifications"];
  }

  if (accountStatus !== "Active") {
    return [];
  }

  const modules = new Set(["dashboard", "profile"]);
  for (const permission of permissionSet) {
    const [moduleName] = permission.split(".");
    if (!moduleName) continue;
    modules.add(moduleName);
  }

  return Array.from(modules).sort();
}

export function isProtectedAccessAllowed(accountStatus) {
  return accountStatus === "Active" || accountStatus === "Pending";
}
