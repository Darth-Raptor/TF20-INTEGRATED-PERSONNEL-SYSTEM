const tabs = document.querySelectorAll(".nav-tab");
const panels = document.querySelectorAll("[data-view-panel]");
const viewTitle = document.querySelector("#viewTitle");
const rolePanels = document.querySelectorAll("[data-role-panel]");
const syncButton = document.querySelector("#syncButton");
const toast = document.querySelector("#toast");
const currentUserName = document.querySelector("#currentUserName");
const currentUserMeta = document.querySelector("#currentUserMeta");

const applicationSearch = document.querySelector("#applicationSearch");
const applicationStatusFilter = document.querySelector("#applicationStatusFilter");
const applicationRows = document.querySelector("#applicationRows");
const applicationDetail = document.querySelector("#applicationDetail");
const applicationDetailStatus = document.querySelector("#applicationDetailStatus");
const applicationForm = document.querySelector("#applicationForm");
const applicationSteam64 = document.querySelector("#applicationSteam64");
const applicationTimezone = document.querySelector("#applicationTimezone");
const applicationInterest = document.querySelector("#applicationInterest");
const applicationAvailability = document.querySelector("#applicationAvailability");
const applicationExperience = document.querySelector("#applicationExperience");
const applicationReadiness = document.querySelector("#applicationReadiness");
const applicationMotivation = document.querySelector("#applicationMotivation");
const applicationRules = document.querySelector("#applicationRules");
const applicationFormFeedback = document.querySelector("#applicationFormFeedback");
const submitApplicationButton = document.querySelector("#submitApplicationButton");
const markContactedButton = document.querySelector("#markContactedButton");
const acceptApplicantButton = document.querySelector("#acceptApplicantButton");
const denyApplicantButton = document.querySelector("#denyApplicantButton");

const personnelSearch = document.querySelector("#personnelSearch");
const personnelStatusFilter = document.querySelector("#personnelStatusFilter");
const personnelRows = document.querySelector("#personnelRows");
const personnelDetail = document.querySelector("#personnelDetail");
const personnelDetailStatus = document.querySelector("#personnelDetailStatus");
const flagTrainingButton = document.querySelector("#flagTrainingButton");
const recommendPromotionButton = document.querySelector("#recommendPromotionButton");
const auditRows = document.querySelector("#auditRows");

const userRows = document.querySelector("#userRows");
const userDetailTitle = document.querySelector("#userDetailTitle");
const userDetailStatus = document.querySelector("#userDetailStatus");
const userIdentity = document.querySelector("#userIdentity");
const roleEditor = document.querySelector("#roleEditor");
const roleChangeReason = document.querySelector("#roleChangeReason");
const saveRolesButton = document.querySelector("#saveRolesButton");
const reloadUsersButton = document.querySelector("#reloadUsersButton");
const roleCatalog = document.querySelector("#roleCatalog");

const titles = {
  dashboard: "Dashboard",
  applications: "Applications",
  personnel: "Personnel",
  users: "Users and Roles",
  units: "Units",
  training: "Training",
  events: "Events and Attendance",
  loa: "Leave of Absence",
  actions: "Promotions, Awards, and Discipline",
  support: "Bug Reports and Support",
  systems: "Systems",
  audit: "Audit Log",
};

const roleAccess = {
  applicant: ["dashboard", "applications", "support"],
  member: ["dashboard", "personnel", "training", "events", "loa", "support", "audit"],
  staff: ["dashboard", "applications", "personnel", "units", "training", "events", "loa", "actions", "support", "audit"],
  command: [
    "dashboard",
    "applications",
    "personnel",
    "units",
    "training",
    "events",
    "loa",
    "actions",
    "support",
    "systems",
    "audit",
  ],
  system: [
    "dashboard",
    "applications",
    "personnel",
    "users",
    "units",
    "training",
    "events",
    "loa",
    "actions",
    "support",
    "systems",
    "audit",
  ],
};

let applications = [];

const personnel = [
  {
    id: "pers-havoc",
    rank: "COL",
    alias: "Havoc 6",
    discord: "havoc6",
    steam64: "76561198000002001",
    unit: "Task Force 20",
    billet: "Task Force Commander",
    status: "Active",
    flags: "Command",
    staff: "Command Staff",
    qualifications: "Mission Command, Instructor, Zeus",
    attendance: "96%",
    loa: "None",
    note: "Final approval authority for policy changes, promotions, and major status changes.",
  },
  {
    id: "pers-raptor",
    rank: "SSG",
    alias: "Raptor",
    discord: "raptor",
    steam64: "76561198000002004",
    unit: "A CO, 1/75th Ranger Regiment",
    billet: "Squad Leader",
    status: "Active",
    flags: "Promotion packet",
    staff: "None",
    qualifications: "Ranger School, Breacher, CLS",
    attendance: "84%",
    loa: "None",
    note: "Runs assault rehearsals and accountability for Ranger element.",
  },
  {
    id: "pers-newman",
    rank: "RCT",
    alias: "Newman",
    discord: "newman",
    steam64: "",
    unit: "Recruit Holding / Training Pipeline",
    billet: "Recruit Candidate",
    status: "Recruit",
    flags: "Steam64 pending",
    staff: "None",
    qualifications: "Orientation Complete",
    attendance: "100%",
    loa: "None",
    note: "Awaiting final recruit evaluation and unit assignment.",
  },
  {
    id: "pers-nightmare",
    rank: "CW3",
    alias: "Nightmare",
    discord: "nightmare",
    steam64: "76561198000002005",
    unit: "B CO, 2/160th SOAR",
    billet: "Aviation Lead",
    status: "Leave of Absence",
    flags: "LOA overlap review",
    staff: "S3 Training",
    qualifications: "Rotary-Wing Pilot, CAS, Air Assault",
    attendance: "79%",
    loa: "Approved through 2026-05-04",
    note: "Flagged because RCON observed server presence during approved LOA.",
  },
  {
    id: "pers-mako",
    rank: "SPC",
    alias: "Mako",
    discord: "mako",
    steam64: "76561198000002006",
    unit: "A CO, 1/75th Ranger Regiment",
    billet: "Automatic Rifleman",
    status: "Active",
    flags: "CLS requalification due",
    staff: "None",
    qualifications: "Rifleman, CLS, Basic Radio",
    attendance: "72%",
    loa: "None",
    note: "Needs updated qualification packet after next FTX.",
  },
];

const auditLog = [
  {
    timestamp: "2026-04-28 12:14",
    actor: "S1 NCOIC",
    module: "LOA",
    action: "Approved",
    reason: "Work conflict reviewed",
  },
  {
    timestamp: "2026-04-28 12:06",
    actor: "Training Authority",
    module: "Qualification",
    action: "Pending Approval",
    reason: "Instructor recommendation",
  },
  {
    timestamp: "2026-04-28 11:54",
    actor: "System",
    module: "Discord Sync",
    action: "Failed",
    reason: "Missing mapped role ID",
  },
  {
    timestamp: "2026-04-28 11:41",
    actor: "Command Staff",
    module: "Promotion",
    action: "Approved",
    reason: "Packet validated by S1",
  },
];

let currentView = "dashboard";
let selectedApplicationId = null;
let selectedPersonnelId = personnel[1].id;
let currentUser = null;
let activeAccessRole = "applicant";
let portalUsers = [];
let portalRoles = [];
let selectedUserId = null;

const applicationFieldMap = {
  steam64Id: applicationSteam64,
  timezone: applicationTimezone,
  roleInterest: applicationInterest,
  availability: applicationAvailability,
  experience: applicationExperience,
  technicalReadiness: applicationReadiness,
  motivation: applicationMotivation,
  rulesAcknowledgement: applicationRules,
};

const applicationErrorMap = {
  steam64Id: document.querySelector("#applicationSteam64Error"),
  timezone: document.querySelector("#applicationTimezoneError"),
  roleInterest: document.querySelector("#applicationInterestError"),
  availability: document.querySelector("#applicationAvailabilityError"),
  experience: document.querySelector("#applicationExperienceError"),
  technicalReadiness: document.querySelector("#applicationReadinessError"),
  motivation: document.querySelector("#applicationMotivationError"),
  rulesAcknowledgement: document.querySelector("#applicationRulesError"),
};

tabs.forEach((tab) => {
  tab.addEventListener("click", () => setView(tab.dataset.view));
});

syncButton.addEventListener("click", () => {
  appendAudit(currentUser?.displayName || "Current User", "Discord Sync", "Queued", "Mock sync request from portal toolbar");
  showToast("Mock Discord sync queued. Production sync must run from the backend.");
});

applicationSearch.addEventListener("input", () => loadApplications());
applicationStatusFilter.addEventListener("change", () => loadApplications());
applicationForm?.addEventListener("submit", submitApplicantForm);
Object.entries(applicationFieldMap).forEach(([key, field]) => {
  field?.addEventListener("input", () => validateApplicationField(key, { silent: true }));
  field?.addEventListener("blur", () => validateApplicationField(key));
});
personnelSearch.addEventListener("input", renderPersonnel);
personnelStatusFilter.addEventListener("change", renderPersonnel);

markContactedButton.addEventListener("click", () => updateSelectedApplication("Contacted", "Applicant marked contacted"));
acceptApplicantButton.addEventListener("click", () => updateSelectedApplication("Accepted", "Applicant accepted and recruit conversion queued"));
denyApplicantButton.addEventListener("click", () => updateSelectedApplication("Denied", "Applicant denied after staff review"));
flagTrainingButton.addEventListener("click", () => {
  const member = selectedPersonnel();
  appendAudit("Training Staff", "Training", "Flagged", `${member.alias} flagged for training follow-up`);
  showToast(`${member.alias} flagged for training follow-up.`);
});
recommendPromotionButton.addEventListener("click", () => {
  const member = selectedPersonnel();
  appendAudit("Unit Leadership", "Promotion", "Recommended", `${member.alias} promotion recommendation opened`);
  showToast(`${member.alias} promotion recommendation mocked.`);
});

saveRolesButton?.addEventListener("click", saveSelectedUserRoles);
reloadUsersButton?.addEventListener("click", () => {
  loadUserAdmin();
});

initPortal();

async function initPortal() {
  try {
    const session = await fetchJson("/api/me");
    currentUser = session.user;
    activeAccessRole = deriveAccessRole(currentUser);
    updateSessionSummary();
    applyRole();
    await loadApplications();
    renderAllRecords();
    setView(currentView);

    if (canManageUsers()) {
      await loadUserAdmin();
    }
  } catch (error) {
    console.error(error);
    updateSessionSummary(error);
    applyRole();
    renderAllRecords();
    setView("dashboard");
    showToast("Unable to load your live session. Try signing in again.");
  }
}

function setView(viewName) {
  currentView = viewName;
  tabs.forEach((tab) => tab.classList.toggle("active", tab.dataset.view === viewName));
  panels.forEach((panel) => panel.classList.toggle("active", panel.dataset.viewPanel === viewName));
  viewTitle.textContent = titles[viewName] || titleCase(viewName);
}

function applyRole() {
  const role = activeAccessRole;
  const allowed = roleAccess[role] || roleAccess.staff;

  tabs.forEach((tab) => {
    const isAllowed = allowed.includes(tab.dataset.view);
    tab.hidden = !isAllowed;
  });

  if (!allowed.includes(currentView)) {
    setView("dashboard");
  }

  rolePanels.forEach((panel) => {
    const panelRole = panel.dataset.rolePanel;
    const visible =
      role === "system" ||
      panelRole === role ||
      (role === "command" && ["staff", "command"].includes(panelRole)) ||
      (role === "staff" && panelRole === "staff");
    panel.classList.toggle("visible", visible);
  });

  syncButton.disabled = !hasPermission("discord:sync") && !["command", "system"].includes(role);
  syncButton.textContent = role === "system" ? "Retry Discord Sync" : "Queue Discord Sync";
}

function renderAllRecords() {
  renderApplications();
  renderPersonnel();
  renderAudit();
}

async function loadApplications() {
  if (!applicationRows) return;

  const params = new URLSearchParams();
  const query = applicationSearch.value.trim();
  const status = applicationStatusFilter.value;
  if (query) params.set("search", query);
  if (status && status !== "all") params.set("status", status);

  applicationRows.innerHTML = `<tr><td colspan="5">Loading applications...</td></tr>`;
  try {
    const response = await fetchJson(`/api/applications${params.toString() ? `?${params}` : ""}`);
    applications = (response.items || []).map(normalizeApplication);
    if (!applications.some((application) => application.id === selectedApplicationId)) {
      selectedApplicationId = applications[0]?.id || null;
    }
    renderApplications();
    hydrateApplicationForm();
  } catch (error) {
    console.error(error);
    applicationRows.innerHTML = `<tr><td colspan="5">Unable to load applications.</td></tr>`;
    applicationDetail.innerHTML = `<p class="panel-copy">Application data is unavailable right now.</p>`;
    showToast("Unable to load applications.");
  }
}

function renderApplications() {
  if (!applications.some((application) => application.id === selectedApplicationId)) {
    selectedApplicationId = applications[0]?.id || null;
  }

  applicationRows.innerHTML = applications.length
    ? applications
        .map(
          (application) => `
            <tr data-application-id="${escapeHtml(application.id)}" class="${application.id === selectedApplicationId ? "selected" : ""}">
              <td><strong>${escapeHtml(application.alias)}</strong><br><span class="muted">${escapeHtml(application.discord)}</span></td>
              <td>${statusPill(applicationStatusLabel(application.status))}</td>
              <td>${escapeHtml(application.interest)}</td>
              <td>${escapeHtml(application.availability)}</td>
              <td>${escapeHtml(application.readiness)}</td>
            </tr>
          `,
        )
        .join("")
    : `<tr><td colspan="5">No applications match the current filters.</td></tr>`;

  applicationRows.querySelectorAll("[data-application-id]").forEach((row) => {
    row.addEventListener("click", () => {
      selectedApplicationId = row.dataset.applicationId;
      renderApplications();
    });
  });

  renderApplicationDetail();
}

function renderApplicationDetail() {
  const application = selectedApplication();
  const role = activeAccessRole;
  const canProcess = ["staff", "command", "system"].includes(role) || hasPermission("applications:write");

  if (!application) {
    applicationDetailStatus.textContent = "No application";
    applicationDetail.innerHTML = `<p class="panel-copy">Submit an application to create the first intake record for this account.</p>`;
    [markContactedButton, acceptApplicantButton, denyApplicantButton].forEach((button) => {
      button.disabled = true;
    });
    return;
  }

  applicationDetailStatus.textContent = applicationStatusLabel(application.status);
  applicationDetail.innerHTML = `
    <div class="detail-title">
      <div>
        <strong>${escapeHtml(application.alias)}</strong>
        <span>${escapeHtml(application.discord)} ${application.steam64 ? `| ${escapeHtml(application.steam64)}` : "| Steam64 missing"}</span>
      </div>
      ${statusPill(applicationStatusLabel(application.status))}
    </div>
    <div class="detail-grid">
      <div><span>Role Interest</span><strong>${escapeHtml(application.interest)}</strong></div>
      <div><span>Availability</span><strong>${escapeHtml(application.availability)}</strong></div>
      <div><span>Timezone</span><strong>${escapeHtml(application.timezone)}</strong></div>
      <div><span>Readiness</span><strong>${escapeHtml(application.readiness)}</strong></div>
      <div><span>Experience</span><strong>${escapeHtml(application.experience)}</strong></div>
      <div><span>Next Step</span><strong>${escapeHtml(application.nextStep)}</strong></div>
    </div>
    <p class="detail-copy">${escapeHtml(application.answer)}</p>
    <div class="tag-cloud">
      ${application.answers.map((answer) => `<span>${escapeHtml(answer.questionText)}: ${escapeHtml(answer.answer)}</span>`).join("")}
    </div>
  `;

  [markContactedButton, acceptApplicantButton, denyApplicantButton].forEach((button) => {
    button.disabled = !canProcess || ["Denied", "ConvertedToRecruit", "Withdrawn"].includes(application.status);
  });
}

function renderPersonnel() {
  const role = activeAccessRole;
  const query = personnelSearch.value.trim().toLowerCase();
  const status = personnelStatusFilter.value;
  const visiblePersonnel = personnel.filter((member) => {
    const roleAllowed = role !== "member" || member.id === "pers-mako";
    const matchesStatus = status === "all" || member.status === status;
    const searchable = [
      member.rank,
      member.alias,
      member.discord,
      member.steam64,
      member.unit,
      member.billet,
      member.status,
      member.flags,
      member.qualifications,
    ]
      .join(" ")
      .toLowerCase();
    return roleAllowed && matchesStatus && (!query || searchable.includes(query));
  });

  if (!visiblePersonnel.some((member) => member.id === selectedPersonnelId)) {
    selectedPersonnelId = visiblePersonnel[0]?.id || personnel[0].id;
  }

  personnelRows.innerHTML = visiblePersonnel.length
    ? visiblePersonnel
        .map(
          (member) => `
            <tr data-personnel-id="${escapeHtml(member.id)}" class="${member.id === selectedPersonnelId ? "selected" : ""}">
              <td>${escapeHtml(member.rank)}</td>
              <td><strong>${escapeHtml(member.alias)}</strong><br><span class="muted">${escapeHtml(member.discord)}</span></td>
              <td>${escapeHtml(member.unit)}</td>
              <td>${escapeHtml(member.billet)}</td>
              <td>${statusPill(member.status)}</td>
              <td>${escapeHtml(member.flags)}</td>
            </tr>
          `,
        )
        .join("")
    : `<tr><td colspan="6">No personnel records match the current filters.</td></tr>`;

  personnelRows.querySelectorAll("[data-personnel-id]").forEach((row) => {
    row.addEventListener("click", () => {
      selectedPersonnelId = row.dataset.personnelId;
      renderPersonnel();
    });
  });

  renderPersonnelDetail();
}

function renderPersonnelDetail() {
  const member = selectedPersonnel();
  const role = activeAccessRole;
  const canEdit = ["staff", "command", "system"].includes(role) || hasPermission("personnel:write");

  personnelDetailStatus.textContent = member.status;
  personnelDetail.innerHTML = `
    <div class="detail-title">
      <div>
        <strong>${escapeHtml(member.rank)} ${escapeHtml(member.alias)}</strong>
        <span>${escapeHtml(member.unit)}</span>
      </div>
      ${statusPill(member.status)}
    </div>
    <div class="detail-grid">
      <div><span>Primary Billet</span><strong>${escapeHtml(member.billet)}</strong></div>
      <div><span>Staff Assignment</span><strong>${escapeHtml(member.staff)}</strong></div>
      <div><span>Discord</span><strong>${escapeHtml(member.discord)}</strong></div>
      <div><span>Steam64</span><strong>${escapeHtml(member.steam64 || "Missing")}</strong></div>
      <div><span>Attendance</span><strong>${escapeHtml(member.attendance)}</strong></div>
      <div><span>LOA</span><strong>${escapeHtml(member.loa)}</strong></div>
      <div><span>Qualifications</span><strong>${escapeHtml(member.qualifications)}</strong></div>
      <div><span>Flags</span><strong>${escapeHtml(member.flags)}</strong></div>
    </div>
    <p class="detail-copy">${escapeHtml(member.note)}</p>
    <div class="tag-cloud">
      <span>Overview</span><span>Identity</span><span>Service Record</span><span>Assignments</span>
      <span>Rank History</span><span>Billet History</span><span>Qualifications</span><span>Training</span>
      <span>Attendance</span><span>LOA</span><span>Awards</span><span>Admin Notes</span><span>Audit History</span>
    </div>
  `;

  [flagTrainingButton, recommendPromotionButton].forEach((button) => {
    button.disabled = !canEdit;
  });
}

function renderAudit() {
  auditRows.innerHTML = auditLog
    .map(
      (entry) => `
        <tr>
          <td>${escapeHtml(entry.timestamp)}</td>
          <td>${escapeHtml(entry.actor)}</td>
          <td>${escapeHtml(entry.module)}</td>
          <td>${escapeHtml(entry.action)}</td>
          <td>${escapeHtml(entry.reason)}</td>
        </tr>
      `,
    )
    .join("");
}

async function loadUserAdmin() {
  if (!canManageUsers()) return;

  try {
    const [rolesResponse, usersResponse] = await Promise.all([fetchJson("/api/roles"), fetchJson("/api/users")]);
    portalRoles = rolesResponse.items || [];
    portalUsers = usersResponse.items || [];
    selectedUserId = selectedUserId || currentUser?.id || portalUsers[0]?.id || null;
    renderUsers();
    renderRoleCatalog();
  } catch (error) {
    console.error(error);
    if (userRows) {
      userRows.innerHTML = `<tr><td colspan="4">Unable to load users and roles.</td></tr>`;
    }
    showToast("Unable to load user administration.");
  }
}

function renderUsers() {
  if (!userRows) return;

  if (!portalUsers.length) {
    userRows.innerHTML = `<tr><td colspan="4">No users have signed in yet.</td></tr>`;
    renderUserDetail();
    return;
  }

  if (!portalUsers.some((user) => user.id === selectedUserId)) {
    selectedUserId = portalUsers[0].id;
  }

  userRows.innerHTML = portalUsers
    .map((user) => {
      const roleNames = user.roles.map((role) => role.name);
      return `
        <tr data-user-id="${escapeHtml(user.id)}" class="${user.id === selectedUserId ? "selected" : ""}">
          <td><strong>${escapeHtml(displayUserName(user))}</strong><br><span class="muted">${escapeHtml(user.username || "Unknown Discord")}</span></td>
          <td>${statusPill(user.accountStatus || "Unknown")}</td>
          <td>${roleNames.length ? roleNames.map((name) => `<span class="pill">${escapeHtml(name)}</span>`).join(" ") : `<span class="muted">No assigned roles</span>`}</td>
          <td>${escapeHtml(formatDate(user.lastLoginAt || user.createdAt))}</td>
        </tr>
      `;
    })
    .join("");

  userRows.querySelectorAll("[data-user-id]").forEach((row) => {
    row.addEventListener("click", () => {
      selectedUserId = row.dataset.userId;
      renderUsers();
    });
  });

  renderUserDetail();
}

function renderUserDetail() {
  if (!userDetailTitle || !userIdentity || !roleEditor) return;

  const user = selectedPortalUser();
  if (!user) {
    userDetailTitle.textContent = "Role Assignment";
    userDetailStatus.textContent = "Select a user";
    userIdentity.innerHTML = "";
    roleEditor.innerHTML = "";
    saveRolesButton.disabled = true;
    return;
  }

  const assignedRoles = new Set(user.roles.map((role) => role.name));
  userDetailTitle.textContent = displayUserName(user);
  userDetailStatus.textContent = user.accountStatus || "Unknown status";
  userIdentity.innerHTML = `
    <div><span>Discord</span><strong>${escapeHtml(user.username || "Unknown")}</strong></div>
    <div><span>Email</span><strong>${escapeHtml(user.email || "Not provided")}</strong></div>
    <div><span>Discord ID</span><strong>${escapeHtml(user.discordId || "Not provided")}</strong></div>
  `;

  roleEditor.innerHTML = portalRoles
    .map((role) => {
      const isChecked = assignedRoles.has(role.name);
      const locksSelfAdmin = user.id === currentUser?.id && role.name === "System Admin" && isChecked;
      return `
        <label class="role-option">
          <input type="checkbox" value="${escapeHtml(role.name)}" ${isChecked ? "checked" : ""} ${locksSelfAdmin ? "disabled" : ""} />
          <span>
            <strong>${escapeHtml(role.name)}</strong>
            <small>${escapeHtml(role.description || "No description provided.")}</small>
          </span>
        </label>
      `;
    })
    .join("");

  saveRolesButton.disabled = false;
}

function renderRoleCatalog() {
  if (!roleCatalog) return;

  roleCatalog.innerHTML = portalRoles.length
    ? portalRoles
        .map(
          (role) => `
            <article>
              <strong>${escapeHtml(role.name)}</strong>
              <small>${escapeHtml(role.permissions.length ? role.permissions.join(", ") : "No elevated permissions")}</small>
            </article>
          `,
        )
        .join("")
    : `<p class="panel-copy">No roles loaded.</p>`;
}

async function saveSelectedUserRoles() {
  const user = selectedPortalUser();
  if (!user) return;

  const roles = [...roleEditor.querySelectorAll('input[type="checkbox"]:checked')].map((checkbox) => checkbox.value);
  const reason = roleChangeReason.value.trim() || "Updated from portal user administration.";

  saveRolesButton.disabled = true;
  try {
    const response = await fetchJson(`/api/users/${encodeURIComponent(user.id)}/roles`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ roles, reason }),
    });
    portalUsers = portalUsers.map((item) => (item.id === response.user.id ? response.user : item));
    roleChangeReason.value = "";
    renderUsers();

    if (response.user.id === currentUser?.id) {
      const session = await fetchJson("/api/me");
      currentUser = session.user;
      activeAccessRole = deriveAccessRole(currentUser);
      updateSessionSummary();
      applyRole();
    }

    showToast(`${displayUserName(response.user)} roles updated.`);
  } catch (error) {
    console.error(error);
    showToast(error.message || "Unable to update roles.");
  } finally {
    saveRolesButton.disabled = false;
  }
}

async function submitApplicantForm(event) {
  event.preventDefault();
  clearApplicationFeedback();
  const validation = validateApplicationForm();
  if (!validation.isValid) {
    submitApplicationButton.disabled = false;
    setApplicationFeedback("Please fix the highlighted application fields and try again.", "error");
    validation.firstInvalidField?.focus();
    return;
  }

  submitApplicationButton.disabled = true;

  try {
    const response = await fetchJson("/api/applications", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        steam64Id: applicationSteam64.value,
        timezone: applicationTimezone.value,
        roleInterest: applicationInterest.value,
        availability: applicationAvailability.value,
        experience: applicationExperience.value,
        technicalReadiness: applicationReadiness.value,
        motivation: applicationMotivation.value,
        armaExperience: applicationExperience.value,
        rulesAcknowledgement: applicationRules.value,
      }),
    });

    const submitted = normalizeApplication(response.item);
    applications = [submitted, ...applications.filter((application) => application.id !== submitted.id)];
    selectedApplicationId = submitted.id;
    renderApplications();
    setApplicationFeedback("Application submitted successfully. Recruiting staff can now review it.", "success");
    showToast("Application submitted.");
  } catch (error) {
    console.error(error);
    setApplicationFeedback(error.message || "Unable to submit application.", "error");
    showToast(error.message || "Unable to submit application.");
  } finally {
    submitApplicationButton.disabled = false;
  }
}

function hydrateApplicationForm() {
  const ownApplication = applications.find((application) => application.userId === currentUser?.id);
  if (!ownApplication) {
    applicationSteam64.value = currentUser?.profile?.steam64Id || "";
    return;
  }

  applicationSteam64.value = ownApplication.steam64 || "";
  applicationTimezone.value = ownApplication.timezone || "";
  applicationInterest.value = ownApplication.interest || "";
  applicationAvailability.value = ownApplication.availability || "";
  applicationExperience.value = ownApplication.experience || "";
  applicationReadiness.value = ownApplication.readiness || "";
  applicationMotivation.value = ownApplication.answer || "";
  applicationRules.value = ownApplication.answerByKey.rulesAcknowledgement || "";
}

function normalizeApplication(item) {
  const answerByKey = Object.fromEntries((item?.answers || []).map((answer) => [answer.questionKey, answer.answer]));
  const alias = item?.user?.displayAlias || item?.user?.discordDisplayName || item?.user?.discordUsername || "Unknown Applicant";
  const status = item?.status || "Submitted";

  return {
    id: item?.id,
    userId: item?.user?.id,
    alias,
    discord: item?.user?.discordUsername || "Unknown Discord",
    steam64: item?.user?.steam64Id || answerByKey.steam64Id || "",
    status,
    interest: item?.roleInterest || "Not specified",
    availability: item?.availability || "Not specified",
    readiness: item?.technicalReadiness || answerByKey.technicalReadiness || "Not specified",
    timezone: item?.user?.timezone || answerByKey.timezone || "Not specified",
    experience: item?.experience || answerByKey.armaExperience || "Not provided",
    nextStep: nextStepForApplication(status),
    answer: answerByKey.motivation || item?.experience || "No short answer provided.",
    answerByKey,
    answers: item?.answers || [],
    history: item?.history || [],
    notes: item?.notes || [],
    submittedAt: item?.submittedAt,
  };
}

function nextStepForApplication(status) {
  switch (status) {
    case "Submitted":
      return "Recruiting staff review and initial contact.";
    case "UnderReview":
      return "Recruiting staff review in progress.";
    case "Contacted":
      return "Schedule or complete interview.";
    case "InterviewScheduled":
      return "Attend scheduled voice interview.";
    case "InterviewPassed":
      return "Await final acceptance decision.";
    case "ConvertedToRecruit":
      return "Recruit profile created; Discord sync can be queued.";
    case "Denied":
      return "Application retained for history.";
    default:
      return "Awaiting next staff action.";
  }
}

function applicationStatusLabel(status) {
  const labels = {
    NotStarted: "Not Started",
    UnderReview: "Under Review",
    InterviewScheduled: "Interview Scheduled",
    InterviewPassed: "Interview Passed",
    ConvertedToRecruit: "Converted to Recruit",
  };
  return labels[status] || status || "Unknown";
}

async function updateSelectedApplication(status, reason) {
  const application = selectedApplication();
  if (!application) return;

  [markContactedButton, acceptApplicantButton, denyApplicantButton].forEach((button) => {
    button.disabled = true;
  });

  try {
    const response = await fetchJson(`/api/applications/${encodeURIComponent(application.id)}/status`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        status,
        reason,
        note: reason,
      }),
    });
    const updatedApplication = normalizeApplication(response.item);
    applications = applications.map((item) => (item.id === updatedApplication.id ? updatedApplication : item));
    appendAudit(currentUser?.displayName || "Recruiting Staff", "Application", applicationStatusLabel(updatedApplication.status), `${updatedApplication.alias}: ${reason}`);
    renderApplications();
    showToast(`${updatedApplication.alias} status changed to ${applicationStatusLabel(updatedApplication.status)}.`);
  } catch (error) {
    console.error(error);
    showToast(error.message || "Unable to update application.");
    renderApplicationDetail();
  }
}

function appendAudit(actor, module, action, reason) {
  auditLog.unshift({
    timestamp: new Date().toLocaleString("en-US", {
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    }),
    actor,
    module,
    action,
    reason,
  });
  renderAudit();
}

function selectedApplication() {
  return applications.find((application) => application.id === selectedApplicationId) || null;
}

function selectedPersonnel() {
  return personnel.find((member) => member.id === selectedPersonnelId) || personnel[0];
}

function selectedPortalUser() {
  return portalUsers.find((user) => user.id === selectedUserId) || null;
}

function displayUserName(user) {
  return user?.alias || user?.displayName || user?.username || "Unknown User";
}

function deriveAccessRole(user) {
  const roles = new Set(user?.roles || []);
  const permissions = new Set(user?.permissions || []);

  if (roles.has("system-admin") || permissions.has("system:admin")) return "system";
  if (roles.has("command-staff")) return "command";
  if (
    roles.has("staff") ||
    roles.has("recruiter") ||
    permissions.has("applications:write") ||
    permissions.has("personnel:write")
  ) {
    return "staff";
  }
  if (roles.has("member") || (user?.accountStatus && user.accountStatus !== "Applicant")) return "member";
  return "applicant";
}

function hasPermission(permission) {
  return currentUser?.permissions?.includes(permission) || false;
}

function validateApplicationForm() {
  const fieldKeys = Object.keys(applicationFieldMap);
  let firstInvalidField = null;
  const errors = {};

  fieldKeys.forEach((key) => {
    const error = validateApplicationField(key);
    if (error) {
      errors[key] = error;
      if (!firstInvalidField) {
        firstInvalidField = applicationFieldMap[key];
      }
    }
  });

  return {
    isValid: Object.keys(errors).length === 0,
    errors,
    firstInvalidField,
  };
}

function validateApplicationField(key, options = {}) {
  const field = applicationFieldMap[key];
  if (!field) return "";

  const value = field.value.trim();
  let error = "";

  switch (key) {
    case "steam64Id":
      if (value && !/^7656119\d{10}$/.test(value)) {
        error = "Steam64 IDs should be 17 digits and usually begin with 7656119.";
      }
      break;
    case "timezone":
      if (value && !/^[A-Za-z]{2,5}(?:\/[A-Za-z_]+)?$|^UTC[+-]\d{1,2}$|^GMT[+-]\d{1,2}$/.test(value)) {
        error = "Use a short timezone like CST, EST, PST, UTC, GMT, or UTC-5.";
      }
      break;
    case "roleInterest":
      if (value.length < 3) {
        error = "Role interest should be at least 3 characters.";
      }
      break;
    case "availability":
      if (value.length < 12) {
        error = "Availability should include enough detail for scheduling review.";
      }
      break;
    case "experience":
      if (value.length < 12) {
        error = "Experience should include at least a short summary.";
      }
      break;
    case "technicalReadiness":
      if (value && value.length < 8) {
        error = "Add a little more detail or leave this field blank.";
      }
      break;
    case "motivation":
      if (value && value.length < 8) {
        error = "Add a little more detail or leave this field blank.";
      }
      break;
    case "rulesAcknowledgement":
      if (value.length < 10) {
        error = "Confirm that you understand attendance, maturity, and realism expectations.";
      }
      break;
    default:
      break;
  }

  if (!options.silent || error || field.classList.contains("field-invalid")) {
    setFieldError(key, error);
  }

  return error;
}

function setFieldError(key, message) {
  const field = applicationFieldMap[key];
  const errorNode = applicationErrorMap[key];
  if (!field || !errorNode) return;

  field.classList.toggle("field-invalid", Boolean(message));
  field.setAttribute("aria-invalid", message ? "true" : "false");
  errorNode.textContent = message || "";
}

function clearApplicationFeedback() {
  setApplicationFeedback("", "");
}

function setApplicationFeedback(message, state) {
  if (!applicationFormFeedback) return;

  applicationFormFeedback.textContent = message;
  applicationFormFeedback.classList.remove("error", "success");
  if (state) {
    applicationFormFeedback.classList.add(state);
  }
}

function canManageUsers() {
  return activeAccessRole === "system" || hasPermission("system:admin");
}

function updateSessionSummary(error) {
  if (!currentUser || error) {
    currentUserName.textContent = "Session unavailable";
    currentUserMeta.textContent = "Refresh or sign in again if the portal does not recover.";
    return;
  }

  const roleText = currentUser.roles?.length
    ? currentUser.roles.map((role) => titleCase(role.replaceAll("-", " "))).join(", ")
    : currentUser.accountStatus;
  currentUserName.textContent = displayUserName(currentUser);
  currentUserMeta.textContent = `${roleText} | ${currentUser.accountStatus}`;
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, {
    credentials: "same-origin",
    ...options,
  });

  let payload = null;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (!response.ok) {
    throw new Error(payload?.error || `Request failed with ${response.status}`);
  }

  return payload;
}

function formatDate(value) {
  if (!value) return "Never";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Unknown";
  return date.toLocaleString("en-US", {
    month: "short",
    day: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function statusPill(status) {
  const normalized = status.toLowerCase();
  const className =
    normalized.includes("active") || normalized.includes("accepted") || normalized.includes("completed")
      ? "success"
      : normalized.includes("needs") || normalized.includes("denied") || normalized.includes("missing")
        ? "critical"
        : normalized.includes("interview") || normalized.includes("recruit") || normalized.includes("pending")
          ? "warning"
          : "";
  return `<span class="pill ${className}">${escapeHtml(status)}</span>`;
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("show");
  window.clearTimeout(showToast.timeout);
  showToast.timeout = window.setTimeout(() => toast.classList.remove("show"), 2600);
}

function titleCase(value) {
  return value.replace(/(^|\s|-)\S/g, (match) => match.toUpperCase());
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
