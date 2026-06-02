function pageTemplate(title, body) {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${title}</title>
    <style>
      body { font-family: ui-sans-serif, system-ui, sans-serif; background: #111827; color: #f9fafb; margin: 0; }
      main { max-width: 52rem; margin: 0 auto; padding: 4rem 1.5rem; }
      .card { background: #1f2937; border: 1px solid #374151; border-radius: 1rem; padding: 1.5rem; }
      a.button, button { display: inline-block; padding: 0.75rem 1rem; border-radius: 0.75rem; text-decoration: none; background: #2563eb; color: white; border: 0; }
      code { background: #0f172a; padding: 0.1rem 0.3rem; border-radius: 0.25rem; }
      ul { line-height: 1.7; }
      .muted { color: #cbd5e1; }
    </style>
  </head>
  <body>
    <main>${body}</main>
  </body>
</html>`;
}

export function renderLoginScreen() {
  return pageTemplate(
    "TF20 Runtime Login",
    `<div class="card">
      <h1>TF20 Runtime Foundation</h1>
      <p class="muted">Sign in with Discord to test the new runtime auth, gate, and session foundation.</p>
      <p><a class="button" href="/auth/discord/start">Continue with Discord</a></p>
    </div>`,
  );
}

export function renderPendingScreen(summary) {
  return pageTemplate(
    "Pending Access",
    `<div class="card">
      <h1>Pending Access</h1>
      <p class="muted">Your account is authenticated and guild-verified, but it is still pending activation.</p>
      <ul>
        <li>Status: <code>${summary.account.status}</code></li>
        <li>Gate state: <code>${summary.gateState}</code></li>
        <li>Visible modules: <code>${summary.visibleModules.join(", ")}</code></li>
      </ul>
      <p><a class="button" href="/auth/logout">Log out</a></p>
    </div>`,
  );
}

export function renderBlockedScreen(reason) {
  return pageTemplate(
    "Blocked",
    `<div class="card">
      <h1>Access Blocked</h1>
      <p class="muted">The runtime gate blocked access.</p>
      <p>Reason: <code>${reason}</code></p>
      <p><a class="button" href="/">Return to login</a></p>
    </div>`,
  );
}

export function renderAuthenticatedScreen(summary) {
  return pageTemplate(
    "Runtime Ready",
    `<div class="card">
      <h1>Runtime Ready</h1>
      <p class="muted">The restart branch runtime is live enough to prove auth, sessions, account gating, and module visibility.</p>
      <ul>
        <li>Account: <code>${summary.account.displayName ?? summary.authIdentity.displayName ?? summary.authIdentity.username}</code></li>
        <li>Status: <code>${summary.account.status}</code></li>
        <li>Gate state: <code>${summary.gateState}</code></li>
        <li>Visible modules: <code>${summary.visibleModules.join(", ")}</code></li>
        <li>Permissions: <code>${summary.permissions.join(", ") || "none"}</code></li>
      </ul>
      <p><a class="button" href="/auth/logout">Log out</a></p>
    </div>`,
  );
}
