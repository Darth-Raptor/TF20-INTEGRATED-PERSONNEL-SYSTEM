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
      .stack { display: grid; gap: 1rem; }
      .field { display: grid; gap: 0.35rem; margin-bottom: 1rem; }
      label { font-weight: 600; }
      input, select, textarea { width: 100%; box-sizing: border-box; padding: 0.7rem 0.8rem; border-radius: 0.75rem; border: 1px solid #4b5563; background: #111827; color: #f9fafb; }
      textarea { min-height: 6rem; resize: vertical; }
      .button-row { display: flex; gap: 0.75rem; flex-wrap: wrap; }
      .button.secondary { background: #374151; }
      .button.warn, button.warn { background: #b91c1c; }
      .grid { display: grid; gap: 1rem; }
      .panel { background: #111827; border: 1px solid #374151; border-radius: 0.9rem; padding: 1rem; }
      .status { font-weight: 700; }
      .meta-list { margin: 0; padding-left: 1.25rem; }
      .split { display: grid; gap: 1rem; grid-template-columns: repeat(auto-fit, minmax(16rem, 1fr)); }
      .table-wrap { overflow-x: auto; }
      table { width: 100%; border-collapse: collapse; }
      th, td { padding: 0.75rem; border-bottom: 1px solid #374151; text-align: left; vertical-align: top; }
      th { color: #cbd5e1; font-size: 0.9rem; }
      .empty { padding: 2rem 1rem; border: 1px dashed #4b5563; border-radius: 0.9rem; color: #cbd5e1; }
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
      <div class="button-row">
        <a class="button" href="/applications/me">Open application</a>
        <a class="button secondary" href="/auth/logout">Log out</a>
      </div>
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
  const showSelfPersonnel = summary.permissions.includes("personnel.view-self");
  const showRoster = summary.permissions.includes("personnel.view-scoped");
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
      <div class="button-row">
        ${showSelfPersonnel ? `<a class="button" href="/personnel/self">My Personnel</a>` : ""}
        ${showRoster ? `<a class="button" href="/personnel">Personnel Roster</a>` : ""}
        ${summary.permissions.includes("applications.review-recruiter") || summary.permissions.includes("applications.review-target-unit") ? `<a class="button" href="/applications/review">Application review</a>` : ""}
        <a class="button secondary" href="/auth/logout">Log out</a>
      </div>
    </div>`,
  );
}

export function renderPersonnelSelfScreen({ summary, profile }) {
  const content = profile
    ? `<div class="split">
        <div class="panel">
          <h2>Profile</h2>
          <ul class="meta-list">
            <li>Name: <code>${escapeHtml(profile.callsign)}</code></li>
            <li>Status: <code>${profile.status}</code></li>
            <li>Good standing: <code>${profile.goodStanding ? "Yes" : "No"}</code></li>
            <li>Unit: <code>${escapeHtml(profile.currentUnit?.name ?? "Unassigned")}</code></li>
            <li>Rank: <code>${escapeHtml(profile.currentRank?.name ?? "Unassigned")}</code></li>
            <li>Billet: <code>${escapeHtml(profile.currentBillet?.name ?? "Unassigned")}</code></li>
            <li>Specialty: <code>${escapeHtml(profile.currentSpecialty?.name ?? "Unassigned")}</code></li>
            <li>Joined: <code>${formatDate(profile.joinedAt)}</code></li>
            <li>Accepted: <code>${formatDate(profile.acceptedAt)}</code></li>
          </ul>
        </div>
        <div class="panel">
          <h2>Recent status</h2>
          <ul class="meta-list">
            ${profile.statusHistory.length
              ? profile.statusHistory.map((entry) => `<li><strong>${entry.newStatus}</strong> · ${formatDate(entry.effectiveAt)}<br /><span class="muted">${escapeHtml(entry.reason)}</span></li>`).join("")
              : "<li>No status history recorded yet.</li>"}
          </ul>
        </div>
      </div>`
    : `<div class="empty">No personnel profile is attached to this account yet.</div>`;

  return pageTemplate(
    "My Personnel",
    `<div class="stack">
      <div class="card">
        <h1>My Personnel</h1>
        <p class="muted">This is the read-only personnel view for active members.</p>
        <ul class="meta-list">
          <li>Account: <code>${escapeHtml(summary.account.displayName ?? summary.authIdentity.displayName ?? summary.authIdentity.username ?? summary.account.id)}</code></li>
          <li>Status: <code>${summary.account.status}</code></li>
        </ul>
        <div class="button-row">
          <a class="button secondary" href="/">Back</a>
          <a class="button secondary" href="/auth/logout">Log out</a>
        </div>
      </div>
      ${content}
    </div>`,
  );
}

export function renderPersonnelRosterScreen({
  summary,
  items,
  units,
  filters,
  errorMessage,
}) {
  return pageTemplate(
    "Personnel Roster",
    `<div class="stack">
      <div class="card">
        <h1>Personnel Roster</h1>
        <p class="muted">Scoped staff and command users can view and manage personnel profiles in their effective scope.</p>
        <div class="button-row">
          <a class="button secondary" href="/">Back</a>
          <a class="button secondary" href="/auth/logout">Log out</a>
        </div>
      </div>
      ${errorMessage ? `<div class="card"><strong>${escapeHtml(errorMessage)}</strong></div>` : ""}
      <div class="card">
        <form method="get" action="/personnel">
          <div class="split">
            <div class="field">
              <label for="status">Status filter</label>
              <select id="status" name="status">
                <option value="">All statuses</option>
                ${personnelStatusOptions().map((status) => `<option value="${status}" ${filters.status === status ? "selected" : ""}>${status}</option>`).join("")}
              </select>
            </div>
            <div class="field">
              <label for="unitId">Unit filter</label>
              <select id="unitId" name="unitId">
                <option value="">All units in scope</option>
                ${units.map((unit) => `<option value="${unit.id}" ${filters.unitId === unit.id ? "selected" : ""}>${escapeHtml(unit.name)}</option>`).join("")}
              </select>
            </div>
          </div>
          <div class="button-row">
            <button type="submit">Apply filters</button>
          </div>
        </form>
      </div>
      <div class="card">
        ${items.length
          ? `<div class="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>Name</th>
                    <th>Account</th>
                    <th>Status</th>
                    <th>Unit</th>
                    <th>Rank</th>
                    <th>Billet</th>
                    <th>Specialty</th>
                    <th>Standing</th>
                    <th></th>
                  </tr>
                </thead>
                <tbody>
                  ${items.map((item) => `<tr>
                    <td>${escapeHtml(item.callsign)}</td>
                    <td>${escapeHtml(item.account.displayName ?? item.account.authIdentities[0]?.displayName ?? item.account.authIdentities[0]?.username ?? item.account.id)}</td>
                    <td>${item.status}</td>
                    <td>${escapeHtml(item.currentUnit?.name ?? "Unassigned")}</td>
                    <td>${escapeHtml(item.currentRank?.code ?? "—")}</td>
                    <td>${escapeHtml(item.currentBillet?.name ?? "Unassigned")}</td>
                    <td>${escapeHtml(item.currentSpecialty?.code ?? "—")}</td>
                    <td>${item.goodStanding ? "Good" : "Restricted"}</td>
                    <td><a class="button secondary" href="/personnel/${item.id}">Open</a></td>
                  </tr>`).join("")}
                </tbody>
              </table>
            </div>`
          : `<div class="empty">No personnel profiles match the current filters and scope.</div>`}
      </div>
    </div>`,
  );
}

export function renderPersonnelDetailScreen({
  summary,
  profile,
  lookups,
  canUpdate,
  formState,
  errorMessage,
}) {
  return pageTemplate(
    "Personnel Detail",
    `<div class="stack">
      <div class="card">
        <h1>Personnel Detail</h1>
        <p class="muted">Operational profile view for scoped staff and command users.</p>
        <div class="button-row">
          <a class="button secondary" href="/personnel">Back to roster</a>
          <a class="button secondary" href="/auth/logout">Log out</a>
        </div>
      </div>
      ${errorMessage ? `<div class="card"><strong>${escapeHtml(errorMessage)}</strong></div>` : ""}
      <div class="split">
        <div class="card">
          <h2>${escapeHtml(profile.callsign)}</h2>
          <ul class="meta-list">
            <li>Account: <code>${escapeHtml(profile.account.displayName ?? profile.account.authIdentities[0]?.displayName ?? profile.account.authIdentities[0]?.username ?? profile.account.id)}</code></li>
            <li>Status: <code>${profile.status}</code></li>
            <li>Good standing: <code>${profile.goodStanding ? "Yes" : "No"}</code></li>
            <li>Unit: <code>${escapeHtml(profile.currentUnit?.name ?? "Unassigned")}</code></li>
            <li>Rank: <code>${escapeHtml(profile.currentRank?.name ?? "Unassigned")}</code></li>
            <li>Billet: <code>${escapeHtml(profile.currentBillet?.name ?? "Unassigned")}</code></li>
            <li>Specialty: <code>${escapeHtml(profile.currentSpecialty?.name ?? "Unassigned")}</code></li>
            <li>Joined: <code>${formatDate(profile.joinedAt)}</code></li>
            <li>Accepted: <code>${formatDate(profile.acceptedAt)}</code></li>
          </ul>
        </div>
        <div class="card">
          <h2>Recent history</h2>
          <ul class="meta-list">
            ${buildHistoryPreview("Status", profile.statusHistory, (entry) => `${entry.newStatus} · ${formatDate(entry.effectiveAt)}`)}
            ${buildHistoryPreview("Rank", profile.rankHistory, (entry) => `${entry.rank?.name ?? "Unassigned"} · ${formatDate(entry.effectiveAt)}`)}
            ${buildHistoryPreview("Unit", profile.unitAssignments, (entry) => `${entry.unit?.name ?? "Unassigned"} · ${formatDate(entry.effectiveAt)}`)}
            ${buildHistoryPreview("Billet", profile.billetAssignments, (entry) => `${entry.billet?.name ?? "Unassigned"} · ${formatDate(entry.effectiveAt)}`)}
            ${buildHistoryPreview("Specialty", profile.specialtyHistory, (entry) => `${entry.specialty?.name ?? "Unassigned"} · ${formatDate(entry.effectiveAt)}`)}
            ${buildHistoryPreview("Standing", profile.standingHistory, (entry) => `${entry.newGoodStanding ? "Good standing" : "Not in good standing"} · ${formatDate(entry.effectiveAt)}`)}
          </ul>
        </div>
      </div>
      ${canUpdate ? renderPersonnelUpdateForm(profile.id, lookups, formState) : `<div class="card"><p class="muted">You can view this profile, but you do not have personnel update permission.</p></div>`}
    </div>`,
  );
}

export function renderOwnApplicationScreen({
  summary,
  application,
  units,
  formState,
  errorMessage,
}) {
  const applicationPanel = application
    ? `<div class="panel stack">
        <div>
          <h2>Current application</h2>
          <p class="muted">This is your live enlistment application record.</p>
        </div>
        <ul class="meta-list">
          <li>Status: <span class="status">${application.status}</span></li>
          <li>Target unit: <code>${application.targetUnit?.name ?? "Unknown"}</code></li>
          <li>Submitted: <code>${formatDate(application.submittedAt)}</code></li>
          <li>Form version: <code>${application.formVersion}</code></li>
        </ul>
        <div class="split">
          <div class="panel">
            <h3>Answers</h3>
            <ul class="meta-list">
              ${application.answers.map((answer) => `<li><strong>${escapeHtml(answer.questionText)}:</strong> ${escapeHtml(answer.answer || "—")}</li>`).join("")}
            </ul>
          </div>
          <div class="panel">
            <h3>Status history</h3>
            <ul class="meta-list">
              ${application.statusHistory.map((entry) => `<li><strong>${entry.newStatus}</strong> · ${formatDate(entry.createdAt)}<br /><span class="muted">${escapeHtml(entry.reason || "No reason recorded.")}</span></li>`).join("")}
            </ul>
          </div>
        </div>
      </div>`
    : `<div class="panel">
        <h2>No application on file</h2>
        <p class="muted">Submit your enlistment application below to enter recruiter screening.</p>
      </div>`;

  return pageTemplate(
    "Applicant Flow",
    `<div class="stack">
      <div class="card">
        <h1>Applicant Flow</h1>
        <p class="muted">Pending users can submit one enlistment application and track its status here.</p>
        <ul class="meta-list">
          <li>Account: <code>${escapeHtml(summary.account.displayName ?? summary.authIdentity.displayName ?? summary.authIdentity.username ?? summary.account.id)}</code></li>
          <li>Status: <code>${summary.account.status}</code></li>
          <li>Gate state: <code>${summary.gateState}</code></li>
        </ul>
        <div class="button-row">
          <a class="button secondary" href="/">Back</a>
          <a class="button secondary" href="/auth/logout">Log out</a>
        </div>
      </div>
      ${errorMessage ? `<div class="card"><strong>${escapeHtml(errorMessage)}</strong></div>` : ""}
      ${applicationPanel}
      ${application ? "" : renderApplicationForm(units, formState)}
    </div>`,
  );
}

export function renderApplicationReviewQueueScreen({ summary, applications, errorMessage }) {
  return pageTemplate(
    "Application Review",
    `<div class="stack">
      <div class="card">
        <h1>Application Review</h1>
        <p class="muted">Authorized reviewers can screen applicants, adjust target units, and complete final decisions.</p>
        <div class="button-row">
          <a class="button secondary" href="/">Back</a>
          <a class="button secondary" href="/auth/logout">Log out</a>
        </div>
      </div>
      ${errorMessage ? `<div class="card"><strong>${escapeHtml(errorMessage)}</strong></div>` : ""}
      <div class="grid">
        ${applications.length
          ? applications.map((application) => `<div class="card">
              <h2>${escapeHtml(application.account.displayName ?? application.account.authIdentities[0]?.displayName ?? application.account.authIdentities[0]?.username ?? application.account.id)}</h2>
              <p class="muted">${escapeHtml(application.targetUnit?.name ?? "Unknown unit")}</p>
              <ul class="meta-list">
                <li>Status: <code>${application.status}</code></li>
                <li>Submitted: <code>${formatDate(application.submittedAt)}</code></li>
                <li>Target unit: <code>${escapeHtml(application.targetUnit?.name ?? "Unknown")}</code></li>
              </ul>
              <p><a class="button" href="/applications/${application.id}">Open review</a></p>
            </div>`).join("")
          : `<div class="card"><p class="muted">There are no applications in your review queue right now.</p></div>`}
      </div>
    </div>`,
  );
}

export function renderApplicationReviewDetailScreen({
  summary,
  application,
  units,
  canRecruiterReview,
  canTargetUnitReview,
  errorMessage,
}) {
  const answersMarkup = application.answers.map((answer) =>
    `<li><strong>${escapeHtml(answer.questionText)}:</strong> ${escapeHtml(answer.answer || "—")}</li>`
  ).join("");

  const historyMarkup = application.statusHistory.map((entry) =>
    `<li><strong>${entry.newStatus}</strong> · ${formatDate(entry.createdAt)}<br /><span class="muted">${escapeHtml(entry.reason || "No reason recorded.")}</span></li>`
  ).join("");

  const notesMarkup = application.notes.length
    ? application.notes.map((note) =>
        `<li><strong>${note.stage ?? "General"}</strong> · ${formatDate(note.createdAt)}<br />${escapeHtml(note.body)}</li>`
      ).join("")
    : `<li>No review notes yet.</li>`;

  return pageTemplate(
    "Review Application",
    `<div class="stack">
      <div class="card">
        <h1>Review Application</h1>
        <p class="muted">Reviewer workflow for recruiter screening and target-unit decision actions.</p>
        <div class="button-row">
          <a class="button secondary" href="/applications/review">Back to queue</a>
          <a class="button secondary" href="/auth/logout">Log out</a>
        </div>
      </div>
      ${errorMessage ? `<div class="card"><strong>${escapeHtml(errorMessage)}</strong></div>` : ""}
      <div class="split">
        <div class="card">
          <h2>${escapeHtml(application.account.displayName ?? application.account.authIdentities[0]?.displayName ?? application.account.authIdentities[0]?.username ?? application.account.id)}</h2>
          <ul class="meta-list">
            <li>Application ID: <code>${application.id}</code></li>
            <li>Status: <code>${application.status}</code></li>
            <li>Target unit: <code>${escapeHtml(application.targetUnit?.name ?? "Unknown")}</code></li>
            <li>Submitted: <code>${formatDate(application.submittedAt)}</code></li>
          </ul>
        </div>
        <div class="card">
          <h2>Applicant answers</h2>
          <ul class="meta-list">${answersMarkup}</ul>
        </div>
      </div>
      <div class="split">
        <div class="card">
          <h2>Status history</h2>
          <ul class="meta-list">${historyMarkup}</ul>
        </div>
        <div class="card">
          <h2>Review notes</h2>
          <ul class="meta-list">${notesMarkup}</ul>
        </div>
      </div>
      <div class="split">
        ${canRecruiterReview ? renderReviewerActionCard({
          title: "Recruiter recommendation",
          action: `/applications/${application.id}/recommend`,
          buttonLabel: "Recommend applicant",
          reasonLabel: "Recruiter recommendation reason",
          noteLabel: "Recruiter note",
        }) : ""}
        ${canTargetUnitReview ? renderAssignUnitCard(application.id, units, application.targetUnitId) : ""}
      </div>
      <div class="split">
        ${canTargetUnitReview ? renderReviewerActionCard({
          title: "Accept and convert",
          action: `/applications/${application.id}/accept`,
          buttonLabel: "Accept application",
          reasonLabel: "Acceptance reason",
          noteLabel: "Final decision note",
        }) : ""}
        ${canRecruiterReview || canTargetUnitReview ? renderRejectCard(application.id) : ""}
      </div>
    </div>`,
  );
}

function renderApplicationForm(units, formState) {
  return `<div class="card">
    <h2>Submit enlistment application</h2>
    <form method="post" action="/applications">
      <div class="field">
        <label for="targetUnitId">Target unit</label>
        <select id="targetUnitId" name="targetUnitId" required>
          <option value="">Select a unit</option>
          ${units.map((unit) => `<option value="${unit.id}" ${formState.targetUnitId === unit.id ? "selected" : ""}>${escapeHtml(unit.name)}</option>`).join("")}
        </select>
      </div>
      <div class="field">
        <label for="preferredCallsign">Preferred name</label>
        <input id="preferredCallsign" name="preferredCallsign" value="${escapeHtml(formState.preferredCallsign)}" />
      </div>
      <div class="field">
        <label for="age">Age</label>
        <input id="age" name="age" value="${escapeHtml(formState.age)}" />
      </div>
      <div class="field">
        <label for="timezone">Timezone</label>
        <input id="timezone" name="timezone" value="${escapeHtml(formState.timezone)}" />
      </div>
      <div class="field">
        <label for="availability">Availability</label>
        <textarea id="availability" name="availability">${escapeHtml(formState.availability)}</textarea>
      </div>
      <div class="field">
        <label for="experience">Relevant experience</label>
        <textarea id="experience" name="experience">${escapeHtml(formState.experience)}</textarea>
      </div>
      <div class="field">
        <label for="motivation">Why do you want to join TF20?</label>
        <textarea id="motivation" name="motivation">${escapeHtml(formState.motivation)}</textarea>
      </div>
      <div class="button-row">
        <button type="submit">Submit application</button>
      </div>
    </form>
  </div>`;
}

function renderPersonnelUpdateForm(profileId, lookups, formState) {
  return `<div class="card">
    <h2>Update personnel</h2>
    <form method="post" action="/personnel/${profileId}/update">
      <div class="split">
        <div class="field">
          <label for="name">Name</label>
          <input id="name" name="name" required value="${escapeHtml(formState.name)}" />
        </div>
        <div class="field">
          <label for="status">Status</label>
          <select id="status" name="status" required>
            ${lookups.statuses.map((status) => `<option value="${status}" ${formState.status === status ? "selected" : ""}>${status}</option>`).join("")}
          </select>
        </div>
      </div>
      <div class="split">
        <div class="field">
          <label for="currentUnitId">Unit</label>
          <select id="currentUnitId" name="currentUnitId">
            <option value="">Unassigned</option>
            ${lookups.units.map((unit) => `<option value="${unit.id}" ${formState.currentUnitId === unit.id ? "selected" : ""}>${escapeHtml(unit.name)}</option>`).join("")}
          </select>
        </div>
        <div class="field">
          <label for="currentRankId">Rank</label>
          <select id="currentRankId" name="currentRankId">
            <option value="">Unassigned</option>
            ${lookups.ranks.map((rank) => `<option value="${rank.id}" ${formState.currentRankId === rank.id ? "selected" : ""}>${escapeHtml(rank.code)} — ${escapeHtml(rank.name)}</option>`).join("")}
          </select>
        </div>
      </div>
      <div class="split">
        <div class="field">
          <label for="currentBilletId">Billet</label>
          <select id="currentBilletId" name="currentBilletId">
            <option value="">Unassigned</option>
            ${lookups.billets.map((billet) => `<option value="${billet.id}" ${formState.currentBilletId === billet.id ? "selected" : ""}>${escapeHtml(billet.name)}</option>`).join("")}
          </select>
        </div>
        <div class="field">
          <label for="currentSpecialtyId">Specialty</label>
          <select id="currentSpecialtyId" name="currentSpecialtyId">
            <option value="">Unassigned</option>
            ${lookups.specialties.map((specialty) => `<option value="${specialty.id}" ${formState.currentSpecialtyId === specialty.id ? "selected" : ""}>${escapeHtml(specialty.code)} — ${escapeHtml(specialty.name)}</option>`).join("")}
          </select>
        </div>
      </div>
      <div class="split">
        <div class="field">
          <label for="goodStanding">Good standing</label>
          <select id="goodStanding" name="goodStanding" required>
            <option value="true" ${String(formState.goodStanding) === "true" ? "selected" : ""}>Yes</option>
            <option value="false" ${String(formState.goodStanding) === "false" ? "selected" : ""}>No</option>
          </select>
        </div>
        <div class="field">
          <label for="reason">Audit reason</label>
          <textarea id="reason" name="reason" required>${escapeHtml(formState.reason ?? "")}</textarea>
        </div>
      </div>
      <div class="button-row">
        <button type="submit">Save personnel changes</button>
      </div>
    </form>
  </div>`;
}

function renderReviewerActionCard({ title, action, buttonLabel, reasonLabel, noteLabel }) {
  return `<div class="card">
    <h2>${title}</h2>
    <form method="post" action="${action}">
      <div class="field">
        <label>Reason</label>
        <textarea name="reason" required placeholder="${escapeHtml(reasonLabel)}"></textarea>
      </div>
      <div class="field">
        <label>Optional note</label>
        <textarea name="noteBody" placeholder="${escapeHtml(noteLabel)}"></textarea>
      </div>
      <button type="submit">${buttonLabel}</button>
    </form>
  </div>`;
}

function renderAssignUnitCard(applicationId, units, currentUnitId) {
  return `<div class="card">
    <h2>Assign target unit</h2>
    <form method="post" action="/applications/${applicationId}/assign-unit">
      <div class="field">
        <label for="targetUnitId">Target unit</label>
        <select id="targetUnitId" name="targetUnitId" required>
          ${units.map((unit) => `<option value="${unit.id}" ${unit.id === currentUnitId ? "selected" : ""}>${escapeHtml(unit.name)}</option>`).join("")}
        </select>
      </div>
      <div class="field">
        <label>Reason</label>
        <textarea name="reason" required placeholder="Explain the unit reassignment or confirmation."></textarea>
      </div>
      <button type="submit">Update target unit</button>
    </form>
  </div>`;
}

function renderRejectCard(applicationId) {
  return `<div class="card">
    <h2>Reject application</h2>
    <form method="post" action="/applications/${applicationId}/reject">
      <div class="field">
        <label>Reason</label>
        <textarea name="reason" required placeholder="Explain why the application is being denied."></textarea>
      </div>
      <div class="field">
        <label>Optional note</label>
        <textarea name="noteBody" placeholder="Add reviewer context for the retained record."></textarea>
      </div>
      <button type="submit" class="warn">Reject application</button>
    </form>
  </div>`;
}

function formatDate(value) {
  if (!value) return "Not recorded";
  return new Date(value).toLocaleString("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function buildHistoryPreview(label, items, formatter) {
  if (!items?.length) {
    return `<li><strong>${label}:</strong> <span class="muted">No history recorded.</span></li>`;
  }

  return items
    .slice(0, 3)
    .map((item) => `<li><strong>${label}:</strong> ${formatter(item)}</li>`)
    .join("");
}

function personnelStatusOptions() {
  return [
    "Recruit",
    "Probationary",
    "Active",
    "Reserve",
    "LeaveOfAbsence",
    "Inactive",
    "Separated",
    "Discharged",
    "DoNotRehire",
  ];
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
