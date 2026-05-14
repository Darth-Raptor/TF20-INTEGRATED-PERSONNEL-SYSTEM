import fs from "node:fs";
import path from "node:path";

import { canAccessPersonnelRoster, canAccessRecords } from "./portal-data.js";

export const portalPages = [
  { id: "dashboard", navLabel: "Dashboard", title: "Dashboard", roles: ["applicant", "member", "staff", "command", "system"] },
  { id: "profile", navLabel: "Profile", title: "Profile", roles: ["applicant", "member", "staff", "command", "system"] },
  { id: "applications", navLabel: "Applications", title: "Applications", roles: ["applicant", "staff", "command", "system"], permissions: ["applications:write"] },
  { id: "loa", navLabel: "LOA", title: "Leave of Absence", roles: ["member", "staff", "command", "system"] },
  { id: "personnel", navLabel: "Personnel", title: "Personnel", roles: ["staff", "command", "system"], permissions: ["personnel:read", "personnel:write"], access: canAccessPersonnelRoster },
  { id: "records", navLabel: "Records", title: "Records", roles: ["command", "system"], access: canAccessRecords },
  { id: "events", navLabel: "Events", title: "Events and Attendance", roles: ["member", "staff", "command", "system"] },
  { id: "training", navLabel: "Training", title: "Training", roles: ["member", "staff", "command", "system"] },
  { id: "actions", navLabel: "Actions", title: "Promotions, Awards, and Discipline", roles: ["staff", "command", "system"] },
  { id: "support", navLabel: "Support", title: "Bug Reports and Support", roles: ["applicant", "member", "staff", "command", "system"] },
  { id: "users", navLabel: "Users & Roles", title: "Users and Roles", roles: ["system"], permissions: ["system:admin"] },
  { id: "systems", navLabel: "Systems", title: "Systems", roles: ["command", "system"] },
  { id: "audit", navLabel: "Audit", title: "Audit Log", roles: ["staff", "command", "system"], permissions: ["audit:read"] },
];

const portalPageById = new Map(portalPages.map((page) => [page.id, page]));

export function getPortalPage(pageId) {
  return portalPageById.get(pageId) || null;
}

export function canAccessPortalPage(user, page) {
  if (!page) return false;
  const role = derivePortalAccessRole(user);
  const permissions = user?.permissions || [];

  if (page.roles?.includes(role)) return true;
  if (page.permissions?.some((permission) => permissions.includes(permission))) return true;
  if (page.access?.(user)) return true;

  return false;
}

export function renderPortalPage({ projectRoot, page, user }) {
  const sectionHtml = fs.readFileSync(path.join(projectRoot, "src", "server", "portal-sections", `${page.id}.html`), "utf8");
  return renderPortalShell({
    activePage: page,
    contentHtml: sectionHtml,
    pageScript: `/portal-scripts/${page.id}.js`,
    projectRoot,
    statusCode: 200,
    title: page.title,
    user,
  });
}

export function renderForbiddenPortalPage({ projectRoot, requestedPage, user }) {
  return renderPortalShell({
    activePage: null,
    contentHtml: `
      <section class="view active" data-view-panel="forbidden">
        <div class="section-grid">
          <section class="panel wide">
            <div class="panel-heading">
              <h2>Access Denied</h2>
              <span>Protected portal route</span>
            </div>
            <p class="panel-copy">Your account does not have access to ${escapeHtml(requestedPage?.title || "this portal section")}.</p>
            <div class="action-row">
              <a class="button primary" href="/portal/dashboard">Return to Dashboard</a>
            </div>
          </section>
        </div>
      </section>
    `,
    pageScript: "/portal-scripts/forbidden.js",
    projectRoot,
    statusCode: 403,
    title: "Access Denied",
    user,
  });
}

export function renderMissingPortalPage({ projectRoot, requestedPageId, user }) {
  return renderPortalShell({
    activePage: null,
    contentHtml: `
      <section class="view active" data-view-panel="not-found">
        <div class="section-grid">
          <section class="panel wide">
            <div class="panel-heading">
              <h2>Page Not Found</h2>
              <span>Unknown portal route</span>
            </div>
            <p class="panel-copy">No portal section exists for ${escapeHtml(requestedPageId)}.</p>
            <div class="action-row">
              <a class="button primary" href="/portal/dashboard">Return to Dashboard</a>
            </div>
          </section>
        </div>
      </section>
    `,
    pageScript: "/portal-scripts/forbidden.js",
    projectRoot,
    statusCode: 404,
    title: "Page Not Found",
    user,
  });
}

function renderPortalShell({ activePage, contentHtml, pageScript, statusCode, title, user }) {
  const accessiblePages = portalPages.filter((page) => canAccessPortalPage(user, page));
  const pagePayload = {
    id: activePage?.id || "forbidden",
    statusCode,
    title,
  };
  const navPayload = accessiblePages.map(({ id, navLabel, title: pageTitle }) => ({ id, navLabel, title: pageTitle, href: `/portal/${id}` }));

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <meta
      name="description"
      content="Task Force 20 protected portal for applicant, member, staff, and command workflows."
    />
    <title>${escapeHtml(title.toUpperCase())} | TASK FORCE 20 PERSONNEL MANAGEMENT SYSTEM</title>
    <link rel="icon" type="image/png" sizes="64x64" href="/assets/tf20-favicon.png" />
    <link rel="apple-touch-icon" sizes="180x180" href="/assets/tf20-apple-touch-icon.png" />
    <link rel="stylesheet" href="/portal.css" />
  </head>
  <body data-portal-page="${escapeHtml(pagePayload.id)}">
    <div class="portal-shell">
      <aside class="sidebar" aria-label="Portal navigation">
        <a class="portal-brand" href="/" aria-label="Task Force 20 public site">
          <img src="/assets/tf20-logo.png" alt="" />
          <span>
            <strong>Task Force 20</strong>
            <small>Personnel Management System</small>
          </span>
        </a>

        <div class="auth-card">
          <span>Discord Session</span>
          <strong id="currentUserName">${escapeHtml(displayUserName(user) || "Loading session")}</strong>
          <p id="currentUserMeta">${escapeHtml(sessionMeta(user) || "Checking live roles and permissions...")}</p>
        </div>

        <div class="role-control" id="viewAsControl" hidden>
          <span>View As</span>
          <select id="viewAsSelect" aria-label="View portal as role">
            <option value="">System Admin</option>
            <option value="command">Command</option>
            <option value="staff">Staff</option>
            <option value="member">Member</option>
            <option value="applicant">Applicant</option>
          </select>
        </div>

        <nav class="portal-nav">
          ${accessiblePages.map((page) => navLink(page, activePage)).join("\n          ")}
        </nav>
      </aside>

      <main class="portal-main">
        <header class="topbar">
          <div>
            <h1 id="viewTitle">${escapeHtml(title.toUpperCase())}</h1>
          </div>
          <div class="topbar-actions">
            <a class="button ghost" href="/">Public Site</a>
            <form class="logout-form" action="/logout" method="post">
              <button class="button danger" type="submit">Log Out</button>
            </form>
            <button class="button primary" type="button" id="syncButton">Discord Sync Status</button>
          </div>
        </header>

        ${contentHtml.trim()}
      </main>
    </div>

    <div class="toast" id="toast" role="status" aria-live="polite"></div>
    <script>
      window.TF20_PORTAL_PAGE = ${safeJson(pagePayload)};
      window.TF20_PORTAL_NAV = ${safeJson(navPayload)};
    </script>
    <script src="/portal.js"></script>
    <script src="${escapeHtml(pageScript)}"></script>
  </body>
</html>`;
}

function navLink(page, activePage) {
  const isActive = page.id === activePage?.id;
  return `<a class="nav-tab${isActive ? " active" : ""}" href="/portal/${escapeHtml(page.id)}" data-portal-page="${escapeHtml(page.id)}"${isActive ? ' aria-current="page"' : ""}>${escapeHtml(page.navLabel)}</a>`;
}

function derivePortalAccessRole(user) {
  const roles = new Set(user?.roles || []);
  const permissions = new Set(user?.permissions || []);

  if (roles.has("system-admin") || permissions.has("system:admin")) return "system";
  if (roles.has("command") || roles.has("command-staff") || user?.access?.personnelScope === "all" || canAccessRecords(user)) return "command";
  if (
    roles.has("staff") ||
    roles.has("recruiter") ||
    user?.access?.personnelScope === "scoped" ||
    permissions.has("applications:write") ||
    permissions.has("personnel:write") ||
    permissions.has("personnel:read")
  ) {
    return "staff";
  }
  if (roles.has("member") || (user?.accountStatus && user.accountStatus !== "Applicant")) return "member";
  return "applicant";
}

function displayUserName(user) {
  return user?.alias || user?.displayName || user?.username || "";
}

function sessionMeta(user) {
  if (!user) return "";
  const roleText = user.roles?.length ? user.roles.map((role) => titleCase(role.replaceAll("-", " "))).join(", ") : user.accountStatus;
  return [roleText, user.accountStatus].filter(Boolean).join(" | ");
}

function titleCase(value) {
  return String(value || "").replace(/(^|\s|-)\S/g, (match) => match.toUpperCase());
}

function safeJson(value) {
  return JSON.stringify(value).replaceAll("<", "\\u003c");
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
