const tabs = document.querySelectorAll(".nav-tab");
const panels = document.querySelectorAll("[data-view-panel]");
const viewTitle = document.querySelector("#viewTitle");
const rolePanels = document.querySelectorAll("[data-role-panel]");
const syncButton = document.querySelector("#syncButton");
const toast = document.querySelector("#toast");
const currentUserName = document.querySelector("#currentUserName");
const currentUserMeta = document.querySelector("#currentUserMeta");
const dashboardActivePersonnel = document.querySelector("#dashboardActivePersonnel");
const dashboardActivePersonnelMeta = document.querySelector("#dashboardActivePersonnelMeta");
const dashboardApplications = document.querySelector("#dashboardApplications");
const dashboardApplicationsMeta = document.querySelector("#dashboardApplicationsMeta");
const dashboardAttendanceReview = document.querySelector("#dashboardAttendanceReview");
const dashboardAttendanceReviewMeta = document.querySelector("#dashboardAttendanceReviewMeta");
const dashboardAuditEvents = document.querySelector("#dashboardAuditEvents");
const dashboardAuditEventsMeta = document.querySelector("#dashboardAuditEventsMeta");
const applicantDashboardState = document.querySelector("#applicantDashboardState");
const memberDashboardState = document.querySelector("#memberDashboardState");
const staffDashboardState = document.querySelector("#staffDashboardState");
const commandDashboardState = document.querySelector("#commandDashboardState");
const systemDashboardState = document.querySelector("#systemDashboardState");

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
const personnelUpdateForm = document.querySelector("#personnelUpdateForm");
const personnelEditUnit = document.querySelector("#personnelEditUnit");
const personnelEditBillet = document.querySelector("#personnelEditBillet");
const personnelEditMos = document.querySelector("#personnelEditMos");
const personnelEditStatus = document.querySelector("#personnelEditStatus");
const personnelEditGoodStanding = document.querySelector("#personnelEditGoodStanding");
const personnelEditSections = document.querySelector("#personnelEditSections");
const personnelEditReason = document.querySelector("#personnelEditReason");
const personnelUpdateFeedback = document.querySelector("#personnelUpdateFeedback");
const savePersonnelUpdateButton = document.querySelector("#savePersonnelUpdateButton");
const profileDetail = document.querySelector("#profileDetail");
const profileDetailStatus = document.querySelector("#profileDetailStatus");
const eventRows = document.querySelector("#eventRows");
const eventForm = document.querySelector("#eventForm");
const eventTitle = document.querySelector("#eventTitle");
const eventType = document.querySelector("#eventType");
const eventStatus = document.querySelector("#eventStatus");
const eventStartsAt = document.querySelector("#eventStartsAt");
const eventEndsAt = document.querySelector("#eventEndsAt");
const eventDetails = document.querySelector("#eventDetails");
const eventFormFeedback = document.querySelector("#eventFormFeedback");
const saveEventButton = document.querySelector("#saveEventButton");
const newEventButton = document.querySelector("#newEventButton");
const attendanceDetailStatus = document.querySelector("#attendanceDetailStatus");
const attendanceRows = document.querySelector("#attendanceRows");
const attendanceUpdateForm = document.querySelector("#attendanceUpdateForm");
const attendanceStatus = document.querySelector("#attendanceStatus");
const attendanceRsvpStatus = document.querySelector("#attendanceRsvpStatus");
const attendanceNotes = document.querySelector("#attendanceNotes");
const attendanceReason = document.querySelector("#attendanceReason");
const attendanceFormFeedback = document.querySelector("#attendanceFormFeedback");
const saveAttendanceButton = document.querySelector("#saveAttendanceButton");
const loaForm = document.querySelector("#loaForm");
const loaStartDate = document.querySelector("#loaStartDate");
const loaEndDate = document.querySelector("#loaEndDate");
const loaReasonCategory = document.querySelector("#loaReasonCategory");
const loaDetails = document.querySelector("#loaDetails");
const loaFormFeedback = document.querySelector("#loaFormFeedback");
const submitLoaButton = document.querySelector("#submitLoaButton");
const loaQueue = document.querySelector("#loaQueue");
const unitTreeContainer = document.querySelector("#unitTreeContainer");
const unitSummaryList = document.querySelector("#unitSummaryList");
const supportForm = document.querySelector("#supportForm");
const supportTitle = document.querySelector("#supportTitle");
const supportCategory = document.querySelector("#supportCategory");
const supportSeverity = document.querySelector("#supportSeverity");
const supportSummary = document.querySelector("#supportSummary");
const supportDescription = document.querySelector("#supportDescription");
const supportFormFeedback = document.querySelector("#supportFormFeedback");
const submitSupportButton = document.querySelector("#submitSupportButton");
const supportRows = document.querySelector("#supportRows");
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
  profile: "Profile",
  loa: "Leave of Absence",
  personnel: "Personnel",
  units: "Units",
  events: "Events and Attendance",
  training: "Training",
  users: "Users and Roles",
  actions: "Promotions, Awards, and Discipline",
  support: "Bug Reports and Support",
  systems: "Systems",
  audit: "Audit Log",
};

const roleAccess = {
  applicant: ["dashboard", "profile", "support"],
  member: ["dashboard", "profile", "loa", "personnel", "units", "events", "training", "support", "audit"],
  staff: ["dashboard", "profile", "loa", "personnel", "units", "events", "training", "actions", "support", "audit"],
  command: [
    "dashboard",
    "profile",
    "loa",
    "personnel",
    "units",
    "events",
    "training",
    "actions",
    "support",
    "systems",
    "audit",
  ],
  system: [
    "dashboard",
    "profile",
    "loa",
    "personnel",
    "units",
    "events",
    "training",
    "users",
    "actions",
    "support",
    "systems",
    "audit",
  ],
};

let applications = [];
let personnel = [];
let personnelLoadError = "";
let dashboardSummary = null;
let dashboardSummaryError = "";
let auditLog = [];
let auditLoadError = "";
let loaRequests = [];
let loaLoadError = "";
let unitsData = null;
let unitsLoadError = "";
let supportTickets = [];
let supportLoadError = "";
let personnelLookups = null;
let personnelLookupError = "";
let events = [];
let eventsLoadError = "";
let attendanceEvent = null;
let attendanceRecords = [];
let attendanceLoadError = "";

let currentView = "dashboard";
let selectedApplicationId = null;
let selectedPersonnelId = null;
let selectedEventId = null;
let selectedAttendanceRecordId = null;
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
  showToast("Discord sync is not connected to a live workflow yet.");
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
personnelEditStatus?.addEventListener("change", syncPersonnelStatusLocks);
personnelUpdateForm?.addEventListener("submit", submitPersonnelUpdateForm);
eventForm?.addEventListener("submit", submitEventForm);
newEventButton?.addEventListener("click", () => {
  selectedEventId = null;
  attendanceEvent = null;
  attendanceRecords = [];
  selectedAttendanceRecordId = null;
  renderEvents();
});
attendanceUpdateForm?.addEventListener("submit", submitAttendanceUpdateForm);
loaForm?.addEventListener("submit", submitLoaForm);
supportForm?.addEventListener("submit", submitSupportForm);

markContactedButton.addEventListener("click", () => updateSelectedApplication("Contacted", "Applicant marked contacted"));
acceptApplicantButton.addEventListener("click", () => updateSelectedApplication("Accepted", "Applicant accepted and recruit conversion queued"));
denyApplicantButton.addEventListener("click", () => updateSelectedApplication("Denied", "Applicant denied after staff review"));
flagTrainingButton.addEventListener("click", () => {
  const member = selectedPersonnel();
  if (!member) return;
  showToast("Training follow-up actions are not connected yet.");
});
recommendPromotionButton.addEventListener("click", () => {
  const member = selectedPersonnel();
  if (!member) return;
  showToast("Promotion recommendations are not connected yet.");
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
    await Promise.all([
      loadDashboardSummary(),
      loadApplications(),
      loadPersonnel(),
      loadPersonnelLookups(),
      loadEvents(),
      loadLoaRequests(),
      loadUnits(),
      loadSupportTickets(),
      loadAuditLogs(),
    ]);
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
    let isAllowed = allowed.includes(tab.dataset.view);
    if (tab.dataset.view === "audit" && !canReadAudit()) {
      isAllowed = false;
    }
    tab.hidden = !isAllowed;
  });

  if (!allowed.includes(currentView) || (currentView === "audit" && !canReadAudit())) {
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

  syncButton.disabled = true;
  syncButton.textContent = "Discord Sync Not Connected";
}

function renderAllRecords() {
  renderDashboardSummary();
  renderApplications();
  renderPersonnel();
  renderProfileView();
  renderEvents();
  renderLoaRequests();
  renderUnits();
  renderSupportTickets();
  renderAudit();
}

async function loadDashboardSummary() {
  dashboardSummaryError = "";

  try {
    const response = await fetchJson("/api/summary");
    dashboardSummary = response.item || null;
  } catch (error) {
    console.error(error);
    dashboardSummary = null;
    dashboardSummaryError = error.message || "Unable to load dashboard summary.";
  }

  renderDashboardSummary();
}

function renderDashboardSummary() {
  const summary = dashboardSummary || {};
  const personnelSummary = summary.personnel || {};
  const applicationSummary = summary.applications || {};
  const attendanceSummary = summary.attendance || {};
  const auditSummary = summary.audit || {};
  const workflows = summary.workflows || {};

  dashboardActivePersonnel.textContent = formatCount(personnelSummary.active);
  dashboardActivePersonnelMeta.textContent = dashboardSummaryError
    ? dashboardSummaryError
    : `${formatCount(personnelSummary.total)} total profiles; ${formatCount(personnelSummary.missingBillet)} missing billet; ${formatCount(
        personnelSummary.missingPrimaryMos,
      )} missing Primary MOS`;

  dashboardApplications.textContent = formatCount(applicationSummary.active);
  dashboardApplicationsMeta.textContent = dashboardSummaryError
    ? "Application summary unavailable."
    : `${formatCount(applicationSummary.total)} total; ${formatCount(applicationSummary.awaitingContact)} awaiting staff contact`;

  dashboardAttendanceReview.textContent = formatCount(attendanceSummary.pendingReview);
  dashboardAttendanceReviewMeta.textContent = dashboardSummaryError
    ? "Attendance summary unavailable."
    : `${formatCount(attendanceSummary.totalEvents)} event records; ${formatCount(attendanceSummary.upcomingEvents)} upcoming`;

  dashboardAuditEvents.textContent = formatCount(auditSummary.thisMonth);
  dashboardAuditEventsMeta.textContent = dashboardSummaryError
    ? "Audit summary unavailable."
    : `${formatCount(auditSummary.total)} total audit events`;

  renderApplicantDashboard();
  renderMemberDashboard();
  renderStaffDashboard(workflows, personnelSummary, attendanceSummary);
  renderCommandDashboard(summary.units || []);
  renderSystemDashboard(workflows);
}

function renderApplicantDashboard() {
  const ownApplication = applications.find((application) => application.userId === currentUser?.id);
  const steam64 = currentUser?.steam64Id || ownApplication?.steam64 || "";

  if (!ownApplication) {
    applicantDashboardState.innerHTML = `
      <div class="status-row">
        <span>Application Status</span>
        <strong>No active application</strong>
      </div>
      <div class="status-row">
        <span>Required Next Step</span>
        <strong>Submit the application form when ready</strong>
      </div>
      <ul class="check-list">
        <li class="done">Discord connected</li>
        <li${steam64 ? ' class="done"' : ""}>Steam64 ID ${steam64 ? "submitted" : "not submitted"}</li>
      </ul>
    `;
    return;
  }

  applicantDashboardState.innerHTML = `
    <div class="status-row">
      <span>Application Status</span>
      <strong>${escapeHtml(applicationStatusLabel(ownApplication.status))}</strong>
    </div>
    <div class="status-row">
      <span>Required Next Step</span>
      <strong>${escapeHtml(ownApplication.nextStep)}</strong>
    </div>
    <ul class="check-list">
      <li class="done">Discord connected</li>
      <li${steam64 ? ' class="done"' : ""}>Steam64 ID ${steam64 ? "submitted" : "not submitted"}</li>
      <li${ownApplication.readiness !== "Not specified" ? ' class="done"' : ""}>Technical readiness ${ownApplication.readiness !== "Not specified" ? "provided" : "missing"}</li>
    </ul>
  `;
}

function renderMemberDashboard() {
  const member = personnel.find((item) => item.userId === currentUser?.id) || personnel[0] || null;
  const nextEvent = [...events]
    .filter((item) => item.status !== "Cancelled")
    .sort((left, right) => new Date(left.startsAt).getTime() - new Date(right.startsAt).getTime())[0];

  if (!member) {
    memberDashboardState.innerHTML = `<p class="panel-copy">No personnel profile is available for this account.</p>`;
    return;
  }

  memberDashboardState.innerHTML = `
    <div class="profile-chip">
      <img src="assets/tf20-logo.png" alt="" />
      <div>
        <strong>${escapeHtml(member.rank)} ${escapeHtml(member.alias)}</strong>
        <span>${escapeHtml(member.unit)}</span>
      </div>
    </div>
    <div class="status-row">
      <span>Upcoming Event</span>
      <strong>${escapeHtml(nextEvent ? `${nextEvent.title} | ${formatDate(nextEvent.startsAt)}` : "No event records connected")}</strong>
    </div>
    <div class="status-row">
      <span>Qualifications</span>
      <strong>${escapeHtml(member.qualifications)}</strong>
    </div>
  `;
}

function renderStaffDashboard(workflows, personnelSummary, attendanceSummary) {
  const items = [
    ["Missing billet", `${formatCount(personnelSummary.missingBillet)} personnel profile${personnelSummary.missingBillet === 1 ? "" : "s"} need a primary billet.`],
    [
      "Missing Primary MOS",
      `${formatCount(personnelSummary.missingPrimaryMos)} personnel profile${personnelSummary.missingPrimaryMos === 1 ? "" : "s"} need Primary MOS.`,
    ],
    ["Qualification recommendations", `${formatCount(workflows.pendingQualifications)} records pending approval.`],
    ["Attendance review", `${formatCount(attendanceSummary.pendingReview)} attendance records pending review.`],
  ];

  staffDashboardState.innerHTML = items.map(summaryArticle).join("");
}

function renderCommandDashboard(units) {
  commandDashboardState.innerHTML = units.length
    ? units
        .map((unit) => summaryArticle([unit.name, `${formatCount(unit.personnelCount)} active roster profile${unit.personnelCount === 1 ? "" : "s"}.`]))
        .join("")
    : `<p class="section-note">No primary unit assignments are recorded yet.</p>`;
}

function renderSystemDashboard(workflows) {
  const discordText = workflows.latestDiscordSync
    ? `${workflows.latestDiscordSync.status} ${workflows.latestDiscordSync.action} at ${formatDate(workflows.latestDiscordSync.createdAt)}.`
    : "No Discord sync records are available yet.";

  systemDashboardState.innerHTML = [
    ["Discord sync", discordText],
    ["RCON collector", "No RCON attendance collector records are connected yet."],
    ["Support queue", `${formatCount(workflows.openSupport)} open support records.`],
  ]
    .map(summaryArticle)
    .join("");
}

function summaryArticle([title, body]) {
  return `<article><strong>${escapeHtml(title)}</strong><span>${escapeHtml(body)}</span></article>`;
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

async function loadPersonnel() {
  if (!personnelRows) return;

  personnelLoadError = "";
  personnelRows.innerHTML = `<tr><td colspan="7">Loading personnel...</td></tr>`;

  try {
    let response;
    try {
      response = canReadAllPersonnel()
        ? await fetchJson("/api/personnel?limit=100")
        : { items: [(await fetchJson("/api/personnel/me")).item] };
    } catch (error) {
      if (error.status === 403 && canReadAllPersonnel()) {
        response = { items: [(await fetchJson("/api/personnel/me")).item] };
      } else {
        throw error;
      }
    }

    personnel = (response.items || []).filter(Boolean).map(normalizePersonnel);
    if (!personnel.some((member) => member.id === selectedPersonnelId)) {
      selectedPersonnelId = personnel[0]?.id || null;
    }
  } catch (error) {
    console.error(error);
    personnel = [];
    selectedPersonnelId = null;
    personnelLoadError = error.message || "Unable to load personnel.";
    showToast(personnelLoadError);
  }

  renderPersonnel();
}

async function loadLoaRequests() {
  if (!loaQueue) return;

  loaLoadError = "";
  loaQueue.innerHTML = `<p class="section-note">Loading LOA records...</p>`;

  try {
    const response = await fetchJson("/api/loa?limit=100");
    loaRequests = response.items || [];
  } catch (error) {
    console.error(error);
    loaRequests = [];
    loaLoadError = error.message || "Unable to load LOA records.";
  }

  renderLoaRequests();
}

async function loadUnits() {
  if (!unitTreeContainer) return;

  unitsLoadError = "";
  unitTreeContainer.innerHTML = `<p class="panel-copy">Loading unit hierarchy...</p>`;

  try {
    unitsData = await fetchJson("/api/units");
  } catch (error) {
    console.error(error);
    unitsData = null;
    unitsLoadError = error.message || "Unable to load units.";
  }

  renderUnits();
}

async function loadSupportTickets() {
  if (!supportRows) return;

  supportLoadError = "";
  supportRows.innerHTML = `<tr><td colspan="5">Loading support tickets...</td></tr>`;

  try {
    const response = await fetchJson("/api/support?limit=100");
    supportTickets = response.items || [];
  } catch (error) {
    console.error(error);
    supportTickets = [];
    supportLoadError = error.message || "Unable to load support tickets.";
  }

  renderSupportTickets();
}

async function loadPersonnelLookups() {
  if (!personnelEditUnit || !personnelEditBillet || !personnelEditSections) return;

  personnelLookupError = "";
  if (!canManagePersonnelUpdates()) {
    personnelLookups = null;
    renderPersonnelEditor();
    return;
  }

  try {
    personnelLookups = await fetchJson("/api/lookups/personnel");
  } catch (error) {
    console.error(error);
    personnelLookups = null;
    personnelLookupError = error.message || "Unable to load personnel lookup data.";
  }

  renderPersonnelEditor();
}

async function loadEvents() {
  if (!eventRows) return;

  eventsLoadError = "";
  eventRows.innerHTML = `<tr><td colspan="6">Loading event records...</td></tr>`;

  try {
    const response = await fetchJson("/api/events?limit=100");
    events = response.items || [];
    if (!events.some((item) => item.id === selectedEventId)) {
      selectedEventId = events[0]?.id || null;
    }
  } catch (error) {
    console.error(error);
    events = [];
    selectedEventId = null;
    eventsLoadError = error.message || "Unable to load events.";
  }

  await loadAttendanceForSelectedEvent();
  renderEvents();
}

async function loadAttendanceForSelectedEvent() {
  if (!attendanceRows) return;

  attendanceLoadError = "";
  attendanceEvent = null;
  selectedAttendanceRecordId = null;

  if (!selectedEventId) {
    attendanceRecords = [];
    renderAttendanceRecords();
    return;
  }

  attendanceRows.innerHTML = `<tr><td colspan="4">Loading attendance records...</td></tr>`;
  try {
    const response = await fetchJson(`/api/events/${encodeURIComponent(selectedEventId)}/attendance`);
    attendanceEvent = response.event || null;
    attendanceRecords = response.items || [];
    selectedAttendanceRecordId = attendanceRecords[0]?.id || null;
  } catch (error) {
    console.error(error);
    attendanceEvent = null;
    attendanceRecords = [];
    attendanceLoadError = error.message || "Unable to load attendance records.";
  }

  renderAttendanceRecords();
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
  const query = personnelSearch.value.trim().toLowerCase();
  const status = personnelStatusFilter.value;

  if (personnelLoadError) {
    personnelRows.innerHTML = `<tr><td colspan="7">${escapeHtml(personnelLoadError)}</td></tr>`;
    renderPersonnelDetail();
    return;
  }

  const visiblePersonnel = personnel.filter((member) => {
    const matchesStatus = status === "all" || member.status === status;
    const searchable = [
      member.rank,
      member.alias,
      member.discord,
      member.steam64,
      member.unit,
      member.primaryMos,
      member.billet,
      member.statusLabel,
      member.flags,
      member.qualifications,
    ]
      .join(" ")
      .toLowerCase();
    return matchesStatus && (!query || searchable.includes(query));
  });

  if (!visiblePersonnel.some((member) => member.id === selectedPersonnelId)) {
    selectedPersonnelId = visiblePersonnel[0]?.id || null;
  }

  personnelRows.innerHTML = visiblePersonnel.length
    ? visiblePersonnel
        .map(
          (member) => `
            <tr data-personnel-id="${escapeHtml(member.id)}" class="${member.id === selectedPersonnelId ? "selected" : ""}">
              <td>${escapeHtml(member.rank)}</td>
              <td><strong>${escapeHtml(member.alias)}</strong><br><span class="muted">${escapeHtml(member.discord)}</span></td>
              <td>${escapeHtml(member.unit)}</td>
              <td>${escapeHtml(member.primaryMos || "None")}</td>
              <td>${escapeHtml(member.billet)}</td>
              <td>${statusPill(member.statusLabel)}</td>
              <td>${escapeHtml(member.flags)}</td>
            </tr>
          `,
        )
        .join("")
    : `<tr><td colspan="7">No personnel records match the current filters.</td></tr>`;

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
  const canEdit = canManagePersonnelUpdates();

  if (!member) {
    personnelDetailStatus.textContent = "No profile";
    personnelDetail.innerHTML = `<p class="panel-copy">${escapeHtml(
      personnelLoadError || "No personnel profile is available for the current filters.",
    )}</p>`;
    [flagTrainingButton, recommendPromotionButton].forEach((button) => {
      button.disabled = true;
    });
    renderPersonnelEditor();
    return;
  }

  personnelDetailStatus.textContent = member.statusLabel;
  personnelDetail.innerHTML = personnelDetailMarkup(member);

  [flagTrainingButton, recommendPromotionButton].forEach((button) => {
    button.disabled = !canEdit;
  });
  renderPersonnelEditor();
}

function personnelDetailMarkup(member) {
  return `
    <div class="detail-title">
      <div>
        <strong>${escapeHtml(member.rank)} ${escapeHtml(member.alias)}</strong>
        <span>${escapeHtml(member.unit)}</span>
      </div>
      ${statusPill(member.statusLabel)}
    </div>
    <div class="detail-grid">
      <div><span>Primary Billet</span><strong>${escapeHtml(member.billet)}</strong></div>
      <div><span>Primary MOS</span><strong>${escapeHtml(member.primaryMos || "None")}</strong></div>
      <div><span>Staff Assignment</span><strong>${escapeHtml(member.staff)}</strong></div>
      <div><span>Discord</span><strong>${escapeHtml(member.discord)}</strong></div>
      <div><span>Steam64</span><strong>${escapeHtml(member.steam64 || "Missing")}</strong></div>
      <div><span>Steam Name</span><strong>${escapeHtml(member.steamUsername || "Not linked")}</strong></div>
      <div><span>Steam Profile</span><strong>${steamProfileLinkMarkup(member)}</strong></div>
      <div><span>Timezone</span><strong>${escapeHtml(member.timezone || "Missing")}</strong></div>
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
}

function renderProfileView() {
  if (!profileDetail || !profileDetailStatus) return;

  const member = currentUserPersonnelProfile();

  if (!member) {
    const displayName = displayUserName(currentUser);
    const roleNames = currentUser?.roles?.length ? currentUser.roles.join(", ") : "No assigned roles";
    profileDetailStatus.textContent = currentUser?.accountStatus || "Authenticated";
    profileDetail.innerHTML = `
      <div class="detail-title">
        <div>
          <strong>${escapeHtml(displayName)}</strong>
          <span>${escapeHtml(currentUser?.username || "Unknown Discord account")}</span>
        </div>
        ${statusPill(currentUser?.accountStatus || "Authenticated")}
      </div>
      <div class="detail-grid">
        <div><span>Discord</span><strong>${escapeHtml(currentUser?.username || "Unknown")}</strong></div>
        <div><span>Display Alias</span><strong>${escapeHtml(displayName)}</strong></div>
        <div><span>Steam64</span><strong>${escapeHtml(currentUser?.steam64Id || "Missing")}</strong></div>
        <div><span>Steam Name</span><strong>${escapeHtml(currentUser?.steamUsername || "Not linked")}</strong></div>
        <div><span>Steam Profile</span><strong>${steamProfileLinkMarkup(currentUser)}</strong></div>
        <div><span>Timezone</span><strong>${escapeHtml(currentUser?.timezone || "Missing")}</strong></div>
        <div><span>Account Status</span><strong>${escapeHtml(accountStatusLabel(currentUser?.accountStatus || "Authenticated"))}</strong></div>
        <div><span>Roles</span><strong>${escapeHtml(roleNames)}</strong></div>
      </div>
      <p class="detail-copy">${escapeHtml(personnelLoadError || "This account is authenticated, but no personnel profile is linked yet. Submit a support request so staff can correct the roster link.")}</p>
    `;
    return;
  }

  profileDetailStatus.textContent = member.statusLabel;
  profileDetail.innerHTML = personnelDetailMarkup(member);
}

function renderPersonnelEditor() {
  if (!personnelUpdateForm || !personnelUpdateFeedback) return;

  const member = selectedPersonnel();
  const canEdit = canManagePersonnelUpdates();
  personnelUpdateForm.hidden = !canEdit;

  if (!canEdit) {
    setPersonnelUpdateFeedback("Staff-only personnel updates appear here when your account has write access.", "");
    return;
  }

  if (!member) {
    populateSelect(personnelEditUnit, [], "", "Select a personnel profile");
    populateSelect(personnelEditBillet, [], "", "Select a personnel profile");
    personnelEditMos.value = "";
    personnelEditStatus.value = "Active";
    personnelEditGoodStanding.checked = true;
    personnelEditSections.innerHTML = `<p class="section-note">Select a profile to load staff section options.</p>`;
    savePersonnelUpdateButton.disabled = true;
    setPersonnelUpdateFeedback(personnelLookupError || "Select a profile to edit.", personnelLookupError ? "error" : "");
    syncPersonnelStatusLocks();
    return;
  }

  savePersonnelUpdateButton.disabled = false;
  const unitOptions = (personnelLookups?.units || []).map((unit) => ({
    value: unit.id,
    label: `${unit.name} (${unit.type})`,
  }));
  const billetOptions = (personnelLookups?.billets || []).map((billet) => ({
    value: billet.id,
    label: billet.unitName ? `${billet.name} | ${billet.unitName}` : billet.name,
  }));

  populateSelect(personnelEditUnit, unitOptions, member.unitId, "Select primary unit");
  populateSelect(personnelEditBillet, billetOptions, member.billetId, "Select primary billet");
  personnelEditMos.value = member.primaryMos || "";
  personnelEditStatus.value = member.status || "Active";
  personnelEditGoodStanding.checked = member.goodStanding !== false;

  personnelEditSections.innerHTML = (personnelLookups?.staffSections || []).length
    ? personnelLookups.staffSections
        .map((section) => {
          const isChecked = member.staffSectionIds.includes(section.id);
          const label = section.code ? `${section.code} | ${section.name}` : section.name;
          return `
            <label class="checkbox-field">
              <input type="checkbox" value="${escapeHtml(section.id)}" ${isChecked ? "checked" : ""} />
              <span>${escapeHtml(label)}</span>
            </label>
          `;
        })
        .join("")
    : `<p class="section-note">${escapeHtml(personnelLookupError || "No staff sections are currently seeded.")}</p>`;

  setPersonnelUpdateFeedback(
    personnelLookupError || "Changes here update the selected profile and write an audit entry.",
    personnelLookupError ? "error" : "",
  );
  syncPersonnelStatusLocks();
}

function renderEvents() {
  if (!eventRows) return;

  if (eventsLoadError) {
    eventRows.innerHTML = `<tr><td colspan="6">${escapeHtml(eventsLoadError)}</td></tr>`;
    renderAttendanceRecords();
    renderEventEditor();
    return;
  }

  eventRows.innerHTML = events.length
    ? events
        .map(
          (item) => `
            <tr data-event-id="${escapeHtml(item.id)}" class="${item.id === selectedEventId ? "selected" : ""}">
              <td><strong>${escapeHtml(item.title)}</strong><br><span class="muted">${escapeHtml(item.details || "No details recorded")}</span></td>
              <td>${escapeHtml(item.type)}</td>
              <td>${statusPill(item.status)}</td>
              <td>${escapeHtml(formatDate(item.startsAt))}</td>
              <td>${escapeHtml(formatCount(item.attendanceCount))} records</td>
              <td>${item.ownAttendance ? statusPill(item.ownAttendance.status) : `<span class="muted">No personal attendance record</span>`}</td>
            </tr>
          `,
        )
        .join("")
    : `<tr><td colspan="6">No events have been created yet.</td></tr>`;

  eventRows.querySelectorAll("[data-event-id]").forEach((row) => {
    row.addEventListener("click", async () => {
      selectedEventId = row.dataset.eventId;
      renderEvents();
      await loadAttendanceForSelectedEvent();
      renderEventEditor();
    });
  });

  renderAttendanceRecords();
  renderEventEditor();
}

function renderEventEditor() {
  if (!eventForm || !eventFormFeedback) return;

  const canEdit = canManageEvents();
  const item = selectedEvent();
  eventForm.hidden = !canEdit;

  if (!canEdit) {
    setEventFeedback("Staff and command accounts can create or update events here.", "");
    return;
  }

  eventTitle.value = item?.title || "";
  eventType.value = item?.type || "";
  eventStatus.value = item?.status || "Planned";
  eventStartsAt.value = item?.startsAt ? toDateTimeLocal(item.startsAt) : "";
  eventEndsAt.value = item?.endsAt ? toDateTimeLocal(item.endsAt) : "";
  eventDetails.value = item?.details || "";
  setEventFeedback(item ? "Editing selected event." : "Create the first event record for the live calendar.", "");
}

function renderAttendanceRecords() {
  if (!attendanceRows || !attendanceDetailStatus) return;

  const canEdit = canManageEvents();
  attendanceUpdateForm.hidden = !canEdit;

  if (attendanceLoadError) {
    attendanceDetailStatus.textContent = "Attendance unavailable";
    attendanceRows.innerHTML = `<tr><td colspan="4">${escapeHtml(attendanceLoadError)}</td></tr>`;
    setAttendanceFeedback(attendanceLoadError, "error");
    return;
  }

  if (!selectedEventId || !attendanceEvent) {
    attendanceDetailStatus.textContent = "Select an event";
    attendanceRows.innerHTML = `<tr><td colspan="4">Select an event to review attendance.</td></tr>`;
    setAttendanceFeedback(canEdit ? "Attendance edits require an event selection." : "Attendance review is read-only for members.", "");
    return;
  }

  attendanceDetailStatus.textContent = `${attendanceEvent.title} | ${formatDate(attendanceEvent.startsAt)}`;
  if (!attendanceRecords.length) {
    attendanceRows.innerHTML = `<tr><td colspan="4">No attendance records are available for this event.</td></tr>`;
  } else {
    attendanceRows.innerHTML = attendanceRecords
      .map(
        (record) => `
          <tr data-attendance-id="${escapeHtml(record.id)}" class="${record.id === selectedAttendanceRecordId ? "selected" : ""}">
            <td><strong>${escapeHtml(record.member || "Unknown Member")}</strong><br><span class="muted">${escapeHtml(record.rank)}</span></td>
            <td>${escapeHtml(record.unit)}<br><span class="muted">${escapeHtml(record.billet)}</span></td>
            <td>${statusPill(record.status)}</td>
            <td>${escapeHtml(record.notes || record.overrideReason || "No notes recorded")}</td>
          </tr>
        `,
      )
      .join("");
  }

  attendanceRows.querySelectorAll("[data-attendance-id]").forEach((row) => {
    row.addEventListener("click", () => {
      selectedAttendanceRecordId = row.dataset.attendanceId;
      renderAttendanceRecords();
    });
  });

  const selectedRecord = selectedAttendanceRecord();
  if (!canEdit) {
    setAttendanceFeedback("Members can view only their own attendance record here.", "");
    return;
  }

  attendanceStatus.value = selectedRecord?.status || "PendingReview";
  attendanceRsvpStatus.value = selectedRecord?.rsvpStatus || "";
  attendanceNotes.value = selectedRecord?.notes || "";
  setAttendanceFeedback(selectedRecord ? "Attendance updates require an audit reason." : "Select an attendance record to update.", "");
}

function renderLoaRequests() {
  if (!loaQueue) return;

  if (loaLoadError) {
    loaQueue.innerHTML = `<p class="section-note">${escapeHtml(loaLoadError)}</p>`;
    return;
  }

  if (!loaRequests.length) {
    loaQueue.innerHTML = `<p class="section-note">No LOA requests have been submitted yet.</p>`;
    return;
  }

  const canReview = ["staff", "command", "system"].includes(activeAccessRole) || hasPermission("personnel:write");
  loaQueue.innerHTML = loaRequests
    .map((record) => {
      const buttons = canReview
        ? `<div class="action-row">
            <button class="button" type="button" data-loa-action="approve" data-loa-id="${escapeHtml(record.id)}">Approve</button>
            <button class="button danger" type="button" data-loa-action="deny" data-loa-id="${escapeHtml(record.id)}">Deny</button>
            <button class="button ghost" type="button" data-loa-action="return" data-loa-id="${escapeHtml(record.id)}">Mark Returned</button>
          </div>`
        : "";
      return `
        <article>
          <strong>${escapeHtml(record.member)} | ${escapeHtml(record.rank)}</strong>
          <span>${escapeHtml(record.unit)} | ${escapeHtml(record.billet)}</span>
          <span>${escapeHtml(formatDate(record.startDate))} to ${escapeHtml(formatDate(record.endDate))}</span>
          <span>${escapeHtml(record.reasonCategory)} | ${escapeHtml(record.status)}</span>
          <span>${escapeHtml(record.details || "No additional details provided.")}</span>
          ${buttons}
        </article>
      `;
    })
    .join("");

  loaQueue.querySelectorAll("[data-loa-action]").forEach((button) => {
    button.addEventListener("click", () => reviewLoa(button.dataset.loaId, button.dataset.loaAction));
  });
}

function renderUnits() {
  if (!unitTreeContainer || !unitSummaryList) return;

  if (unitsLoadError) {
    unitTreeContainer.innerHTML = `<p class="panel-copy">${escapeHtml(unitsLoadError)}</p>`;
    unitSummaryList.innerHTML = `<p class="section-note">${escapeHtml(unitsLoadError)}</p>`;
    return;
  }

  const items = unitsData?.items || [];
  const roots = unitsData?.roots || [];
  const byParent = new Map();

  items.forEach((item) => {
    const key = item.parentId || "__root__";
    const list = byParent.get(key) || [];
    list.push(item);
    byParent.set(key, list);
  });

  const renderNode = (unitId) => {
    const unit = items.find((item) => item.id === unitId);
    if (!unit) return "";
    const children = byParent.get(unit.id) || [];
    return `
      <li>
        <strong>${escapeHtml(unit.name)}</strong>
        <span class="muted">${escapeHtml(unit.type)} | ${formatCount(unit.personnelCount)} personnel | ${formatCount(unit.billets.length)} billets</span>
        ${children.length ? `<ul>${children.map((child) => renderNode(child.id)).join("")}</ul>` : ""}
      </li>
    `;
  };

  unitTreeContainer.innerHTML = roots.length ? `<ul>${roots.map((rootId) => renderNode(rootId)).join("")}</ul>` : `<p class="panel-copy">No units have been seeded yet.</p>`;

  const topUnits = [...items].sort((left, right) => right.personnelCount - left.personnelCount).slice(0, 6);
  unitSummaryList.innerHTML = topUnits.length
    ? topUnits
        .map(
          (unit) => `
            <article>
              <strong>${escapeHtml(unit.name)}</strong>
              <span>${formatCount(unit.personnelCount)} personnel | ${formatCount(unit.childCount)} child units | ${formatCount(unit.billets.length)} billets</span>
            </article>
          `,
        )
        .join("")
    : `<p class="section-note">No unit summary is available yet.</p>`;
}

function renderSupportTickets() {
  if (!supportRows) return;

  if (supportLoadError) {
    supportRows.innerHTML = `<tr><td colspan="5">${escapeHtml(supportLoadError)}</td></tr>`;
    return;
  }

  supportRows.innerHTML = supportTickets.length
    ? supportTickets
        .map(
          (ticket) => `
            <tr>
              <td><strong>${escapeHtml(ticket.title)}</strong><br><span class="muted">${escapeHtml(ticket.summary)}</span></td>
              <td>${escapeHtml(ticket.category)}</td>
              <td>${statusPill(ticket.severity)}</td>
              <td>${statusPill(ticket.status)}</td>
              <td>${escapeHtml(ticket.assignedToId || "Unassigned")}</td>
            </tr>
          `,
        )
        .join("")
    : `<tr><td colspan="5">No support or bug report records have been created yet.</td></tr>`;
}

async function submitLoaForm(event) {
  event.preventDefault();
  if (!submitLoaButton) return;

  submitLoaButton.disabled = true;
  setLoaFeedback("", "");

  try {
    const response = await fetchJson("/api/loa", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        startDate: loaStartDate?.value,
        endDate: loaEndDate?.value,
        reasonCategory: loaReasonCategory?.value,
        details: loaDetails?.value,
      }),
    });
    loaRequests = [response.item, ...loaRequests.filter((record) => record.id !== response.item.id)];
    renderLoaRequests();
    await Promise.all([loadDashboardSummary(), loadPersonnel()]);
    setLoaFeedback("LOA request submitted.", "success");
    showToast("LOA submitted.");
  } catch (error) {
    console.error(error);
    setLoaFeedback(error.message || "Unable to submit LOA request.", "error");
  } finally {
    submitLoaButton.disabled = false;
  }
}

async function reviewLoa(loaId, action) {
  const mappedStatus = action === "approve" ? "Approved" : action === "deny" ? "Denied" : "Returned";
  try {
    const response = await fetchJson(`/api/loa/${encodeURIComponent(loaId)}/status`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        status: mappedStatus,
        reason: `Portal LOA review action: ${mappedStatus}.`,
      }),
    });
    loaRequests = loaRequests.map((record) => (record.id === response.item.id ? response.item : record));
    renderLoaRequests();
    await Promise.all([loadDashboardSummary(), loadPersonnel(), loadAuditLogs()]);
    showToast(`LOA ${mappedStatus.toLowerCase()}.`);
  } catch (error) {
    console.error(error);
    showToast(error.message || "Unable to review LOA.");
  }
}

async function submitSupportForm(event) {
  event.preventDefault();
  if (!submitSupportButton) return;

  submitSupportButton.disabled = true;
  setSupportFeedback("", "");

  try {
    const response = await fetchJson("/api/support", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: supportTitle?.value,
        category: supportCategory?.value,
        severity: supportSeverity?.value,
        summary: supportSummary?.value,
        description: supportDescription?.value,
      }),
    });
    supportTickets = [response.item, ...supportTickets.filter((ticket) => ticket.id !== response.item.id)];
    renderSupportTickets();
    await loadDashboardSummary();
    setSupportFeedback("Support ticket submitted.", "success");
    showToast("Support ticket submitted.");
  } catch (error) {
    console.error(error);
    setSupportFeedback(error.message || "Unable to submit support ticket.", "error");
  } finally {
    submitSupportButton.disabled = false;
  }
}

async function submitPersonnelUpdateForm(event) {
  event.preventDefault();
  const member = selectedPersonnel();
  if (!member || !savePersonnelUpdateButton) return;

  savePersonnelUpdateButton.disabled = true;
  setPersonnelUpdateFeedback("", "");

  try {
    const response = await fetchJson(`/api/personnel/${encodeURIComponent(member.id)}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        primaryUnitId: personnelEditUnit?.value || null,
        primaryBilletId: personnelEditBillet?.value || null,
        primaryMos: personnelEditMos?.value || "",
        status: personnelEditStatus?.value || member.status,
        goodStanding: Boolean(personnelEditGoodStanding?.checked),
        staffSectionIds: [...personnelEditSections.querySelectorAll('input[type="checkbox"]:checked')].map((input) => input.value),
        reason: personnelEditReason?.value || "",
      }),
    });

    const updated = normalizePersonnel(response.item);
    personnel = personnel.map((item) => (item.id === updated.id ? updated : item));
    personnelEditReason.value = "";
    renderPersonnel();
    renderProfileView();
    await Promise.all([loadDashboardSummary(), loadAuditLogs()]);
    setPersonnelUpdateFeedback("Personnel profile updated and audited.", "success");
    showToast(`${updated.alias} updated.`);
  } catch (error) {
    console.error(error);
    setPersonnelUpdateFeedback(error.message || "Unable to update personnel profile.", "error");
  } finally {
    savePersonnelUpdateButton.disabled = false;
  }
}

async function submitEventForm(event) {
  event.preventDefault();
  if (!saveEventButton) return;

  saveEventButton.disabled = true;
  setEventFeedback("", "");

  try {
    const selected = selectedEvent();
    const endpoint = selected ? `/api/events/${encodeURIComponent(selected.id)}` : "/api/events";
    const method = selected ? "PATCH" : "POST";
    const response = await fetchJson(endpoint, {
      method,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: eventTitle?.value,
        type: eventType?.value,
        status: eventStatus?.value,
        startsAt: eventStartsAt?.value,
        endsAt: eventEndsAt?.value,
        details: eventDetails?.value,
      }),
    });

    const updated = response.item;
    events = selected
      ? events.map((item) => (item.id === updated.id ? updated : item))
      : [updated, ...events.filter((item) => item.id !== updated.id)];
    selectedEventId = updated.id;
    await loadAttendanceForSelectedEvent();
    renderEvents();
    await Promise.all([loadDashboardSummary(), loadAuditLogs()]);
    setEventFeedback(selected ? "Event updated." : "Event created.", "success");
    showToast(selected ? "Event updated." : "Event created.");
  } catch (error) {
    console.error(error);
    setEventFeedback(error.message || "Unable to save event.", "error");
  } finally {
    saveEventButton.disabled = false;
  }
}

async function submitAttendanceUpdateForm(event) {
  event.preventDefault();
  const record = selectedAttendanceRecord();
  if (!record || !saveAttendanceButton) return;

  saveAttendanceButton.disabled = true;
  setAttendanceFeedback("", "");

  try {
    const response = await fetchJson(
      `/api/events/${encodeURIComponent(selectedEventId)}/attendance/${encodeURIComponent(record.id)}`,
      {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: attendanceStatus?.value,
          rsvpStatus: attendanceRsvpStatus?.value,
          notes: attendanceNotes?.value,
          reason: attendanceReason?.value,
        }),
      },
    );

    attendanceRecords = attendanceRecords.map((item) => (item.id === response.item.id ? response.item : item));
    attendanceReason.value = "";
    renderAttendanceRecords();
    const ownProfileId = currentUserPersonnelProfile()?.id || null;
    events = events.map((item) =>
      item.id === selectedEventId && ownProfileId === response.item.profileId
        ? { ...item, ownAttendance: { id: response.item.id, status: response.item.status, rsvpStatus: response.item.rsvpStatus, notes: response.item.notes } }
        : item,
    );
    renderEvents();
    await Promise.all([loadDashboardSummary(), loadAuditLogs()]);
    setAttendanceFeedback("Attendance record updated and audited.", "success");
    showToast("Attendance record updated.");
  } catch (error) {
    console.error(error);
    setAttendanceFeedback(error.message || "Unable to update attendance record.", "error");
  } finally {
    saveAttendanceButton.disabled = false;
  }
}

function renderAudit() {
  if (!auditRows) return;

  if (!canReadAudit()) {
    auditRows.innerHTML = `<tr><td colspan="5">Audit log access is not assigned to this account.</td></tr>`;
    return;
  }

  if (auditLoadError) {
    auditRows.innerHTML = `<tr><td colspan="5">${escapeHtml(auditLoadError)}</td></tr>`;
    return;
  }

  auditRows.innerHTML = auditLog.length
    ? auditLog
        .map(
          (entry) => `
            <tr>
              <td>${escapeHtml(formatDate(entry.createdAt))}</td>
              <td>${escapeHtml(entry.actor || "Unknown")}</td>
              <td>${escapeHtml(entry.module || "Unknown")}</td>
              <td>${escapeHtml(entry.action || "Unknown")}</td>
              <td>${escapeHtml(entry.reason || "No reason recorded")}</td>
            </tr>
          `,
        )
        .join("")
    : `<tr><td colspan="5">No audit entries are available yet.</td></tr>`;
}

async function loadAuditLogs() {
  if (!auditRows) return;

  auditLoadError = "";
  if (!canReadAudit()) {
    auditLog = [];
    renderAudit();
    return;
  }

  auditRows.innerHTML = `<tr><td colspan="5">Loading audit entries...</td></tr>`;
  try {
    const response = await fetchJson("/api/audit?limit=50");
    auditLog = response.items || [];
  } catch (error) {
    console.error(error);
    auditLog = [];
    auditLoadError = error.message || "Unable to load audit entries.";
  }

  renderAudit();
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
    await loadAuditLogs();

    if (response.user.id === currentUser?.id) {
      const session = await fetchJson("/api/me");
      currentUser = session.user;
      activeAccessRole = deriveAccessRole(currentUser);
      updateSessionSummary();
      applyRole();
      await Promise.all([loadPersonnel(), loadPersonnelLookups(), loadEvents()]);
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
    renderDashboardSummary();
    await Promise.all([loadDashboardSummary(), loadAuditLogs()]);
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

function normalizePersonnel(item) {
  const user = item?.user || {};
  const counts = item?.counts || {};
  const rank = item?.rank?.abbreviation || "Unranked";
  const alias = user.displayAlias || user.discordDisplayName || user.discordUsername || "Unknown Member";
  const billet = item?.billet?.name || "";
  const status = item?.status || user.accountStatus || "Unknown";
  const lockedAssignments = ["Discharged", "BannedDoNotRehire"].includes(status);
  const unit = lockedAssignments ? "None" : item?.unit?.name || "Unassigned";
  const staffAssignments = (item?.staffAssignments || [])
    .map((assignment) => assignment.staffSection?.code || assignment.staffSection?.name)
    .filter(Boolean);
  const flags = [
    !lockedAssignments && !billet ? "Billet missing" : "",
    !lockedAssignments && !item?.primaryMos ? "Primary MOS missing" : "",
    item?.goodStanding === false ? "Not in good standing" : "",
  ].filter(Boolean);
  const joinedText = item?.dateJoined ? `Joined ${formatDate(item.dateJoined)}` : "Join date missing";
  const assignmentCount = Number.isFinite(counts.assignments) ? counts.assignments : 0;

  return {
    id: item?.id,
    userId: user.id,
    unitId: item?.unit?.id || "",
    billetId: item?.billet?.id || "",
    rank,
    alias,
    discord: user.discordUsername || "Unknown Discord",
    steam64: user.steam64Id || "",
    steamUsername: user.steamUsername || "",
    steamProfileUrl: user.steamProfileUrl || "",
    steamAvatarUrl: user.steamAvatarUrl || "",
    steamLinkedAt: user.steamLinkedAt,
    steamLastSyncedAt: user.steamLastSyncedAt,
    timezone: user.timezone || "",
    unit,
    primaryMos: lockedAssignments ? "" : item?.primaryMos || "",
    billet: lockedAssignments ? "None" : billet || "Missing",
    status,
    statusLabel: accountStatusLabel(status),
    goodStanding: item?.goodStanding !== false,
    flags: flags.length ? flags.join(", ") : "None",
    staff: lockedAssignments ? "None" : staffAssignments.length ? staffAssignments.join(", ") : "None",
    staffSectionIds: (item?.staffAssignments || []).map((assignment) => assignment.staffSection?.id).filter(Boolean),
    qualifications: counts.qualifications ? `${counts.qualifications} qualification records` : "No qualifications recorded",
    attendance: counts.attendanceRecords ? `${counts.attendanceRecords} attendance records` : "No attendance records",
    loa: counts.loaRequests ? `${counts.loaRequests} LOA requests` : "None",
    note: `${joinedText}. ${assignmentCount} assignment record${assignmentCount === 1 ? "" : "s"} on file.`,
    updatedAt: item?.updatedAt,
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

function accountStatusLabel(status) {
  const labels = {
    Applicant: "Applicant",
    Recruit: "Recruit",
    ProbationaryMember: "Probationary Member",
    Active: "Active",
    Reserve: "Reserve",
    LeaveOfAbsence: "Leave of Absence",
    Inactive: "Inactive",
    Discharged: "Discharged",
    BannedDoNotRehire: "Banned",
  };
  return labels[status] || status || "Unknown";
}

function isSeparatedPersonnelStatus(status) {
  return ["Discharged", "BannedDoNotRehire"].includes(status);
}

function syncPersonnelStatusLocks() {
  if (!personnelEditStatus) return;

  const locked = isSeparatedPersonnelStatus(personnelEditStatus.value);
  if (personnelEditBillet) {
    if (locked) personnelEditBillet.value = "";
    personnelEditBillet.disabled = locked;
  }
  if (personnelEditMos) {
    if (locked) personnelEditMos.value = "";
    personnelEditMos.disabled = locked;
  }
  if (personnelEditSections) {
    personnelEditSections.querySelectorAll('input[type="checkbox"]').forEach((input) => {
      if (locked) {
        input.checked = false;
      }
      input.disabled = locked;
    });
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
    renderApplications();
    renderDashboardSummary();
    await Promise.all([loadDashboardSummary(), loadAuditLogs()]);
    showToast(`${updatedApplication.alias} status changed to ${applicationStatusLabel(updatedApplication.status)}.`);
  } catch (error) {
    console.error(error);
    showToast(error.message || "Unable to update application.");
    renderApplicationDetail();
  }
}

function selectedApplication() {
  return applications.find((application) => application.id === selectedApplicationId) || null;
}

function selectedPersonnel() {
  return personnel.find((member) => member.id === selectedPersonnelId) || null;
}

function selectedEvent() {
  return events.find((item) => item.id === selectedEventId) || null;
}

function selectedAttendanceRecord() {
  return attendanceRecords.find((item) => item.id === selectedAttendanceRecordId) || null;
}

function currentUserPersonnelProfile() {
  return personnel.find((member) => member.userId === currentUser?.id) || null;
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
  if (roles.has("command-staff") || user?.access?.personnelScope === "all") return "command";
  if (
    roles.has("staff") ||
    roles.has("recruiter") ||
    user?.access?.personnelScope === "scoped" ||
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

function canManagePersonnelUpdates() {
  return ["staff", "command", "system"].includes(activeAccessRole) || hasPermission("personnel:write");
}

function canManageEvents() {
  return ["staff", "command", "system"].includes(activeAccessRole) || hasPermission("personnel:write");
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

function setLoaFeedback(message, state) {
  if (!loaFormFeedback) return;

  loaFormFeedback.textContent = message;
  loaFormFeedback.classList.remove("error", "success");
  if (state) {
    loaFormFeedback.classList.add(state);
  }
}

function setSupportFeedback(message, state) {
  if (!supportFormFeedback) return;

  supportFormFeedback.textContent = message;
  supportFormFeedback.classList.remove("error", "success");
  if (state) {
    supportFormFeedback.classList.add(state);
  }
}

function setPersonnelUpdateFeedback(message, state) {
  if (!personnelUpdateFeedback) return;

  personnelUpdateFeedback.textContent = message;
  personnelUpdateFeedback.classList.remove("error", "success");
  if (state) {
    personnelUpdateFeedback.classList.add(state);
  }
}

function setEventFeedback(message, state) {
  if (!eventFormFeedback) return;

  eventFormFeedback.textContent = message;
  eventFormFeedback.classList.remove("error", "success");
  if (state) {
    eventFormFeedback.classList.add(state);
  }
}

function setAttendanceFeedback(message, state) {
  if (!attendanceFormFeedback) return;

  attendanceFormFeedback.textContent = message;
  attendanceFormFeedback.classList.remove("error", "success");
  if (state) {
    attendanceFormFeedback.classList.add(state);
  }
}

function canManageUsers() {
  return activeAccessRole === "system" || hasPermission("system:admin");
}

function canReadAllPersonnel() {
  return (
    hasPermission("personnel:read") ||
    hasPermission("system:admin") ||
    ["all", "scoped"].includes(currentUser?.access?.personnelScope)
  );
}

function canReadAudit() {
  const roles = new Set(currentUser?.roles || []);
  return (
    hasPermission("audit:read") ||
    hasPermission("system:admin") ||
    roles.has("staff") ||
    roles.has("command-staff") ||
    roles.has("system-admin")
  );
}

function steamProfileLinkMarkup(item) {
  const steam64Id = item?.steam64 || item?.steam64Id || "";
  const profileUrl = item?.steamProfileUrl || (steam64Id ? `https://steamcommunity.com/profiles/${steam64Id}/` : "");
  if (!profileUrl) return "Missing";
  return `<a href="${escapeHtml(profileUrl)}" target="_blank" rel="noopener">Open profile</a>`;
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

function populateSelect(element, options, selectedValue, placeholder) {
  if (!element) return;

  const placeholderOption = placeholder ? `<option value="">${escapeHtml(placeholder)}</option>` : "";
  element.innerHTML =
    placeholderOption +
    options
      .map(
        (option) =>
          `<option value="${escapeHtml(option.value)}" ${String(option.value) === String(selectedValue || "") ? "selected" : ""}>${escapeHtml(option.label)}</option>`,
      )
      .join("");
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
    const error = new Error(payload?.error || `Request failed with ${response.status}`);
    error.status = response.status;
    throw error;
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

function toDateTimeLocal(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";

  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
}

function formatCount(value) {
  const number = Number(value);
  if (!Number.isFinite(number)) return "0";
  return new Intl.NumberFormat("en-US").format(number);
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
