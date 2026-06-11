import { useEffect, useMemo, useState } from "react";
import {
  BadgeCheck,
  BookOpenCheck,
  CalendarDays,
  ChevronDown,
  ChevronLeft,
  ClipboardCheck,
  FileClock,
  Gauge,
  Headphones,
  LogOut,
  Medal,
  Menu,
  Search,
  Settings,
  Shield,
  User,
  Users,
} from "lucide-react";

import {
  findNavigationNodeByPath,
  findSiteMapNodeByPath,
  resolveVisibleNavigation,
} from "../../shared/site-map.mjs";
import tf20Crest from "./assets/tf20-crest.png";

const ICONS = {
  admin: Settings,
  applications: ClipboardCheck,
  awards: Medal,
  dashboard: Gauge,
  events: CalendarDays,
  intake: ClipboardCheck,
  leave: FileClock,
  personnel: Users,
  profile: User,
  promotions: Medal,
  qualifications: BadgeCheck,
  recruiting: ClipboardCheck,
  staff: Users,
  support: Headphones,
  training: BookOpenCheck,
  user: User,
};

export function App() {
  const session = useSession();
  const [path, setPath] = useState(() => window.location.pathname);

  useEffect(() => {
    const handlePopState = () => setPath(window.location.pathname);
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  const navigate = (nextPath, options = {}) => {
    if (!nextPath) return;
    const method = options.replace ? "replaceState" : "pushState";
    if (nextPath !== path || options.replace) {
      window.history[method]({}, "", nextPath);
      setPath(nextPath);
    }
  };

  if (session.status === "loading") {
    return <LoadingScreen />;
  }

  if (session.status === "signed-out") {
    return <AuthScreen error={session.error} />;
  }

  return <PortalShell path={path} session={session} onNavigate={navigate} />;
}

function useSession() {
  const [state, setState] = useState({ status: "loading", error: null });

  useEffect(() => {
    let isActive = true;

    async function load() {
      const summary = await fetchJson("/me");
      if (!isActive) return;

      if (!summary.ok) {
        setState({
          status: "signed-out",
          error: summary.payload?.error?.message ?? "Session required.",
        });
        return;
      }

      const navigation = await fetchJson("/me/navigation");
      if (!isActive) return;

      const permissions = navigation.ok
        ? navigation.payload.data.permissions
        : (summary.payload.data.permissions ?? []);
      const visibleNavigation = navigation.ok
        ? {
            defaultPath: navigation.payload.data.defaultPath,
            sections: navigation.payload.data.sections,
          }
        : resolveVisibleNavigation(summary.payload.data.account?.status, permissions);

      setState({
        status: "signed-in",
        summary: summary.payload.data,
        navigation: visibleNavigation,
        permissions,
        gateState: navigation.payload?.data?.gateState ?? summary.payload.data.gateState,
      });
    }

    load();
    return () => {
      isActive = false;
    };
  }, []);

  return state;
}

async function fetchJson(path, options = {}) {
  try {
    const headers = { Accept: "application/json", ...(options.headers ?? {}) };
    let body = options.body;
    if (body && typeof body !== "string") {
      headers["Content-Type"] = "application/json";
      body = JSON.stringify(body);
    }
    const response = await fetch(path, {
      method: options.method ?? "GET",
      credentials: "include",
      headers,
      body,
    });
    const payload = await response.json().catch(() => ({}));
    return { ok: response.ok, status: response.status, payload };
  } catch {
    return {
      ok: false,
      status: 0,
      payload: { error: { message: "Unable to reach the TF20 runtime." } },
    };
  }
}

function PortalShell({ path, session, onNavigate }) {
  const [detailCollapsed, setDetailCollapsed] = useState(false);
  const [navOpen, setNavOpen] = useState(false);
  const navigation = session.navigation ?? { defaultPath: null, sections: [] };
  const defaultPath = navigation.defaultPath;
  const effectivePath = path === "/" && defaultPath ? defaultPath : path;

  useEffect(() => {
    if (path === "/" && defaultPath) {
      onNavigate(defaultPath, { replace: true });
    }
  }, [path, defaultPath, onNavigate]);

  const visibleMatch = findNavigationNodeByPath(navigation, effectivePath);
  const siteMapMatch = findSiteMapNodeByPath(effectivePath);
  const activeSection =
    navigation.sections.find((section) => section.id === visibleMatch?.section.id) ??
    navigation.sections.find((section) => section.id === siteMapMatch?.section.id) ??
    navigation.sections[0] ??
    null;
  const activeDefinition = visibleMatch?.node ?? { label: "Access unavailable" };

  const selectSection = (sectionId) => {
    const section = navigation.sections.find((item) => item.id === sectionId);
    const nextPath = section?.pages?.[0]?.path ?? section?.path;
    onNavigate(nextPath);
    setNavOpen(false);
  };

  const navigateFromSidebar = (nextPath) => {
    onNavigate(nextPath);
    setNavOpen(false);
  };

  return (
    <div className="portal-shell">
      <aside className={`sidebar-shell${navOpen ? " open" : ""}`} aria-label="Portal navigation">
        <IconRail
          activeSection={activeSection}
          defaultPath={defaultPath}
          sections={navigation.sections}
          onNavigate={onNavigate}
          onSelectSection={selectSection}
        />
        <DetailSidebar
          activePageId={visibleMatch?.page?.id ?? siteMapMatch?.page?.id}
          activeSection={activeSection}
          collapsed={detailCollapsed}
          onNavigate={navigateFromSidebar}
          onToggleCollapsed={() => setDetailCollapsed((value) => !value)}
        />
      </aside>
      <div className="portal-main">
        <TopBar
          activeDefinition={activeDefinition}
          session={session}
          onOpenMenu={() => setNavOpen((value) => !value)}
        />
        <main className="workspace" aria-label={`${activeDefinition.label} workspace`}>
          <Workspace
            navigation={navigation}
            path={effectivePath}
            session={session}
            siteMapMatch={siteMapMatch}
            visibleMatch={visibleMatch}
            onNavigate={onNavigate}
          />
        </main>
      </div>
    </div>
  );
}

function IconRail({ activeSection, defaultPath, sections, onNavigate, onSelectSection }) {
  return (
    <div className="icon-rail">
      <button
        className="tf20-mark"
        type="button"
        aria-label="User dashboard"
        title="User dashboard"
        onClick={() => onNavigate(defaultPath)}
      >
        <img src={tf20Crest} alt="" />
      </button>
      <nav className="rail-nav" aria-label="Primary sections">
        {sections.map((section) => (
          <RailButton
            key={section.id}
            active={activeSection?.id === section.id}
            item={section}
            onClick={() => onSelectSection(section.id)}
          />
        ))}
      </nav>
    </div>
  );
}

function RailButton({ active, item, onClick }) {
  const Icon = iconFor(item.icon);
  return (
    <button
      className={`rail-button${active ? " active" : ""}`}
      type="button"
      aria-label={item.label}
      title={item.label}
      onClick={onClick}
    >
      <Icon size={18} strokeWidth={2} />
    </button>
  );
}

function DetailSidebar({ activePageId, activeSection, collapsed, onNavigate, onToggleCollapsed }) {
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState(true);
  const pages = useMemo(
    () => filterPages(activeSection?.pages ?? [], query),
    [activeSection, query],
  );

  return (
    <div className={`detail-sidebar${collapsed ? " collapsed" : ""}`}>
      <div className="detail-title">
        {collapsed ? null : <h1>{activeSection?.label ?? "Navigation"}</h1>}
        <button
          className="icon-button"
          type="button"
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          title={collapsed ? "Expand" : "Collapse"}
          onClick={onToggleCollapsed}
        >
          <ChevronLeft size={18} />
        </button>
      </div>
      <label className="search-field" title="Search">
        <Search size={16} />
        <input
          aria-label="Search navigation"
          value={query}
          placeholder={collapsed ? "" : "Search"}
          onChange={(event) => setQuery(event.target.value)}
          tabIndex={collapsed ? -1 : 0}
        />
      </label>
      <div className="section-list">
        <section className="menu-section">
          {!collapsed ? (
            <button
              className="section-heading"
              type="button"
              aria-expanded={expanded}
              onClick={() => setExpanded((value) => !value)}
            >
              <span>Pages</span>
              <ChevronDown size={15} />
            </button>
          ) : null}
          {expanded || collapsed ? (
            <div className="menu-items">
              {pages.map((item) => (
                <MenuItem
                  active={activePageId === item.id}
                  collapsed={collapsed}
                  item={item}
                  key={item.id}
                  onNavigate={onNavigate}
                />
              ))}
            </div>
          ) : null}
        </section>
      </div>
    </div>
  );
}

function MenuItem({ active, collapsed, item, onNavigate }) {
  const Icon = iconFor(item.icon);
  return (
    <button
      className={`menu-item${active ? " active" : ""}`}
      type="button"
      title={item.label}
      onClick={() => onNavigate(item.path)}
    >
      <Icon size={17} />
      {collapsed ? null : <span>{item.label}</span>}
    </button>
  );
}

function TopBar({ activeDefinition, session, onOpenMenu }) {
  const displayName =
    session.summary?.account?.displayName ??
    session.summary?.authIdentity?.displayName ??
    session.summary?.authIdentity?.username ??
    "TF20 user";

  return (
    <header className="top-bar">
      <button
        className="mobile-menu-button"
        type="button"
        aria-label="Toggle navigation"
        onClick={onOpenMenu}
      >
        <Menu size={18} />
      </button>
      <div className="top-heading">
        <span className="eyebrow">Task Force 20</span>
        <h2>{activeDefinition.label}</h2>
      </div>
      <div className="account-strip">
        <div className="account-avatar" aria-hidden="true">
          {initials(displayName)}
        </div>
        <div className="account-copy">
          <strong>{displayName}</strong>
          <span>{session.summary?.account?.status ?? "Unknown"}</span>
        </div>
        <a className="logout-button" href="/auth/logout" aria-label="Log out" title="Log out">
          <LogOut size={18} />
        </a>
      </div>
    </header>
  );
}

function Workspace({ navigation, path, session, siteMapMatch, visibleMatch, onNavigate }) {
  if (!visibleMatch) {
    return <AccessUnavailableWorkspace path={path} siteMapMatch={siteMapMatch} />;
  }

  switch (visibleMatch.node.id) {
    case "user_dashboard":
      return (
        <DashboardWorkspace navigation={navigation} session={session} onNavigate={onNavigate} />
      );
    case "user_profile":
      return <ProfileWorkspace session={session} />;
    case "user_application":
      return <ApplicantApplicationWorkspace />;
    case "staff_personnel_management":
      return (
        <StaffPersonnelManagementWorkspace
          session={session}
          subpages={visibleMatch.page.subpages ?? []}
          onNavigate={onNavigate}
        />
      );
    case "recruiting_applications":
      return <ApplicationsWorkspace />;
    default:
      return <ContractPlaceholder match={visibleMatch} />;
  }
}

function DashboardWorkspace({ navigation, session, onNavigate }) {
  const permissions = session.permissions ?? [];
  const visiblePages = navigation.sections.flatMap((section) =>
    section.pages.map((page) => ({ ...page, sectionLabel: section.label })),
  );

  return (
    <div className="workspace-grid">
      <MetricPanel
        label="Gate State"
        value={session.gateState ?? session.summary?.gateState ?? "Unknown"}
      />
      <MetricPanel label="Visible Sections" value={String(navigation.sections.length)} />
      <MetricPanel label="Permissions" value={String(permissions.length)} />
      <section className="wide-panel">
        <PanelHeader title="Visible Pages" />
        <div className="module-grid">
          {visiblePages.map((page) => (
            <PageTile
              item={page}
              key={page.id}
              meta={page.sectionLabel}
              onNavigate={() => onNavigate(page.path)}
            />
          ))}
        </div>
      </section>
    </div>
  );
}

function ProfileWorkspace({ session }) {
  return (
    <div className="workspace-grid">
      <MetricPanel label="Account" value={session.summary?.account?.status ?? "Unknown"} />
      <MetricPanel
        label="Gate"
        value={session.gateState ?? session.summary?.gateState ?? "Unknown"}
      />
      <section className="wide-panel">
        <PanelHeader title="Account Snapshot" />
        <KeyValueList
          items={[
            ["Display name", session.summary?.account?.displayName ?? "Not set"],
            ["Auth provider", session.summary?.authIdentity?.provider ?? "Unknown"],
            ["Username", session.summary?.authIdentity?.username ?? "Unknown"],
            ["Session", session.summary?.session?.id ?? "Active"],
          ]}
        />
      </section>
    </div>
  );
}

function StaffPersonnelManagementWorkspace({ subpages, onNavigate }) {
  const resource = useApiResource("/personnel");

  return (
    <div className="workspace-grid">
      <MetricPanel label="Workspace" value="Personnel Management" />
      <MetricPanel label="Status" value={resource.label} />
      <section className="wide-panel">
        <PanelHeader title="Staff Personnel Roster" />
        <ResourceContent resource={resource} type="personnel-list" />
      </section>
      <section className="wide-panel">
        <PanelHeader title="Personnel Management Subpages" />
        {subpages.length ? (
          <div className="module-grid">
            {subpages.map((subpage) => (
              <PageTile
                item={subpage}
                key={subpage.id}
                meta="Staff update"
                onNavigate={() => onNavigate(subpage.path)}
              />
            ))}
          </div>
        ) : (
          <EmptyState
            title="No subpages available"
            detail="No Personnel Management update subpages are available to this account."
          />
        )}
      </section>
    </div>
  );
}

function ApplicantApplicationWorkspace() {
  const [resource, setResource] = useState({ status: "loading", data: null, error: null });
  const [form, setForm] = useState(() => blankApplicationForm());
  const [message, setMessage] = useState("");

  const load = async () => {
    setResource({ status: "loading", data: null, error: null });
    const result = await fetchJson("/applications/me");
    if (!result.ok) {
      setResource({
        status: "error",
        data: null,
        error: result.payload?.error?.message ?? "Unable to load application.",
      });
      return;
    }

    const data = result.payload.data;
    setResource({ status: "ready", data, error: null });
    setForm(applicationToForm(data.application));
  };

  useEffect(() => {
    load();
  }, []);

  const application = resource.data?.application ?? null;
  const options = resource.data?.options ?? { sources: [], branches: [], units: [], mos: [] };
  const editable = !application || ["Draft", "MoreInfoRequested"].includes(application.status);
  const terminal = ["Converted", "Denied", "Withdrawn", "Closed"].includes(application?.status);

  const action = async (label, request) => {
    setMessage(`${label}...`);
    const result = await request();
    if (!result.ok) {
      setMessage(result.payload?.error?.message ?? `${label} failed.`);
      return;
    }
    setMessage(`${label} complete.`);
    await load();
  };

  if (resource.status === "loading") {
    return <SkeletonRows />;
  }

  if (resource.status === "error") {
    return <EmptyState title="Application unavailable" detail={resource.error} />;
  }

  return (
    <div className="application-page">
      <section className="wide-panel application-panel">
        <PanelHeader title="Enlistment Application" />
        {message ? (
          <div className="form-message">
            <strong>{message}</strong>
          </div>
        ) : null}
        {application ? <ApplicationStatusSummary application={application} /> : null}
        {editable ? (
          <ApplicationForm form={form} options={options} setForm={setForm} />
        ) : (
          <ReadOnlyApplication application={application} />
        )}
        <div className="button-row">
          {editable ? (
            <>
              <button
                className="secondary-action"
                type="button"
                onClick={() =>
                  action("Draft save", () =>
                    fetchJson(application ? "/applications/me" : "/applications/draft", {
                      method: application ? "PATCH" : "POST",
                      body: form,
                    }),
                  )
                }
              >
                Save draft
              </button>
              <button
                className="primary-action button-like"
                type="button"
                onClick={() =>
                  action("Submission", () =>
                    fetchJson("/applications/me/submit", { method: "POST", body: form }),
                  )
                }
              >
                {application?.status === "MoreInfoRequested" ? "Resubmit" : "Submit application"}
              </button>
            </>
          ) : null}
          {application && !terminal ? (
            <button
              className="danger-action"
              type="button"
              onClick={() =>
                action("Withdrawal", () =>
                  fetchJson("/applications/me/withdraw", {
                    method: "POST",
                    body: { reason: "Applicant withdrew through portal." },
                  }),
                )
              }
            >
              Withdraw
            </button>
          ) : null}
        </div>
        {application ? (
          <div className="embedded-history">
            <Timeline items={application.statusHistory ?? []} />
          </div>
        ) : null}
      </section>
    </div>
  );
}

function ApplicationsWorkspace() {
  const [queue, setQueue] = useState({ status: "loading", items: [], error: null });
  const [selectedId, setSelectedId] = useState(null);
  const [detail, setDetail] = useState({ status: "idle", application: null, error: null });
  const [options, setOptions] = useState({ units: [] });
  const [actionState, setActionState] = useState({ reason: "", noteBody: "", targetUnitId: "" });
  const [message, setMessage] = useState("");

  const loadQueue = async () => {
    setQueue({ status: "loading", items: [], error: null });
    const result = await fetchJson("/applications/review");
    if (!result.ok) {
      setQueue({
        status: "error",
        items: [],
        error: result.payload?.error?.message ?? "Unable to load applications.",
      });
      return;
    }
    setQueue({ status: "ready", items: result.payload.items ?? [], error: null });
  };

  const loadDetail = async (applicationId) => {
    if (!applicationId) {
      setDetail({ status: "idle", application: null, error: null });
      return;
    }
    setDetail({ status: "loading", application: null, error: null });
    const result = await fetchJson(`/applications/${applicationId}`);
    if (!result.ok) {
      setDetail({
        status: "error",
        application: null,
        error: result.payload?.error?.message ?? "Unable to load application.",
      });
      return;
    }
    setDetail({ status: "ready", application: result.payload.data, error: null });
    setActionState((current) => ({
      ...current,
      targetUnitId: result.payload.data.targetUnitId ?? "",
    }));
  };

  useEffect(() => {
    loadQueue();
    fetchJson("/applications/recruiting-options").then((result) => {
      if (result.ok) {
        setOptions(result.payload.data ?? { units: [] });
      }
    });
  }, []);

  useEffect(() => {
    loadDetail(selectedId);
  }, [selectedId]);

  const runAction = async (actionName, path, extraBody = {}) => {
    setMessage(`${actionName}...`);
    const result = await fetchJson(path, {
      method: "POST",
      body: {
        reason: actionState.reason,
        noteBody: actionState.noteBody,
        ...extraBody,
      },
    });
    if (!result.ok) {
      setMessage(result.payload?.error?.message ?? `${actionName} failed.`);
      return;
    }
    setMessage(`${actionName} complete.`);
    await loadQueue();
    await loadDetail(selectedId);
  };

  return (
    <div className="workspace-grid">
      <MetricPanel label="Workspace" value="Recruiting" />
      <MetricPanel
        label="Queue"
        value={queue.status === "ready" ? String(queue.items.length) : humanize(queue.status)}
      />
      <MetricPanel
        label="Selected"
        value={detail.application ? humanize(detail.application.status) : "None"}
      />
      {message ? (
        <section className="wide-panel notice-panel">
          <strong>{message}</strong>
        </section>
      ) : null}
      <section className="wide-panel">
        <PanelHeader title="Applications" />
        <ApplicationList
          items={queue.items}
          loading={queue.status === "loading"}
          error={queue.error}
          onSelect={setSelectedId}
          selectedId={selectedId}
        />
      </section>
      <section className="wide-panel">
        <PanelHeader title="Application Detail" />
        <ReviewerApplicationDetail
          actionState={actionState}
          application={detail.application}
          detail={detail}
          onAction={runAction}
          options={options}
          setActionState={setActionState}
        />
      </section>
    </div>
  );
}

function ContractPlaceholder({ match }) {
  return (
    <div className="workspace-grid">
      <MetricPanel label="Section" value={match.section.label} />
      <MetricPanel label="Page" value={match.node.label} />
      <section className="wide-panel">
        <PanelHeader title={match.node.label} />
        <EmptyState
          title={`${match.node.label} is reserved`}
          detail="This page is reserved by the SITE_MAP source of truth. No workflow has been defined for this pass."
        />
      </section>
    </div>
  );
}

function AccessUnavailableWorkspace({ path, siteMapMatch }) {
  const detail = siteMapMatch
    ? `${siteMapMatch.node.label} is listed in the sitemap, but it is not available to this account.`
    : `${path} is not listed in the current TF20 sitemap.`;

  return (
    <div className="workspace-grid">
      <section className="wide-panel">
        <PanelHeader title="Access unavailable" />
        <EmptyState title="Access unavailable" detail={detail} />
      </section>
    </div>
  );
}

function PageTile({ item, meta, onNavigate }) {
  const Icon = iconFor(item.icon);
  return (
    <button className="module-tile action" type="button" onClick={onNavigate}>
      <Icon size={18} />
      <span>{item.label}</span>
      {meta ? <small>{meta}</small> : null}
    </button>
  );
}

function useApiResource(endpoint) {
  const [state, setState] = useState({
    status: "loading",
    label: "Loading",
    data: null,
    error: null,
  });

  useEffect(() => {
    let isActive = true;
    setState({ status: "loading", label: "Loading", data: null, error: null });

    async function load() {
      const result = await fetchJson(endpoint);
      if (!isActive) return;

      if (!result.ok) {
        setState({
          status: "error",
          label: String(result.status || "Error"),
          data: null,
          error: result.payload?.error?.message ?? "Request failed.",
        });
        return;
      }

      setState({
        status: "ready",
        label: "Ready",
        data: result.payload,
        error: null,
      });
    }

    load();
    return () => {
      isActive = false;
    };
  }, [endpoint]);

  return state;
}

function ResourceContent({ resource, type }) {
  if (resource.status === "loading") {
    return <SkeletonRows />;
  }

  if (resource.status === "error") {
    return <EmptyState title="Access unavailable" detail={resource.error} />;
  }

  if (type === "personnel-list") {
    const items = resource.data?.items ?? [];
    return <RosterTable items={items} />;
  }

  if (type === "application-list") {
    const items = resource.data?.items ?? [];
    return <ApplicationList items={items} />;
  }

  const data = resource.data?.data;
  if (!data) {
    return <EmptyState title="No record" detail="No current record was returned." />;
  }

  return <JsonPreview data={data} />;
}

function RosterTable({ items }) {
  if (!items.length) {
    return (
      <EmptyState title="No personnel records" detail="The current scope returned no profiles." />
    );
  }

  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Name</th>
            <th>Status</th>
            <th>Unit</th>
            <th>Rank</th>
            <th>MOS</th>
            <th>Standing</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.id}>
              <td>{item.name}</td>
              <td>{humanize(item.status)}</td>
              <td>{item.currentUnit?.name ?? "Unassigned"}</td>
              <td>{item.currentRank?.abbreviation ?? item.currentRank?.key ?? "-"}</td>
              <td>{item.currentMOS?.identifier ?? item.currentMOS?.key ?? "-"}</td>
              <td>{item.goodStanding ? "Good" : "Restricted"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ApplicationList({
  items,
  loading = false,
  error = null,
  onSelect = null,
  selectedId = null,
}) {
  if (loading) {
    return <SkeletonRows />;
  }

  if (error) {
    return <EmptyState title="Applications unavailable" detail={error} />;
  }

  if (!items.length) {
    return <EmptyState title="No applications" detail="The review queue is empty." />;
  }

  return (
    <div className="record-list">
      {items.map((item) => (
        <button
          className={`record-row action${selectedId === item.id ? " selected" : ""}`}
          key={item.id}
          type="button"
          onClick={() => onSelect?.(item.id)}
        >
          <div>
            <strong>{applicationDisplayName(item)}</strong>
            <span>{item.targetUnit?.name ?? "Unknown unit"}</span>
          </div>
          <span className="status-pill">{humanize(item.status)}</span>
        </button>
      ))}
    </div>
  );
}

function ApplicationForm({ form, options, setForm }) {
  const selectedUnits = new Set(form.interestedUnitIds);
  const mosOptions = selectedUnits.size
    ? (options.mos ?? []).filter((mos) => selectedUnits.has(mos.unitId))
    : [];

  const update = (field, value) => setForm((current) => ({ ...current, [field]: value }));
  const togglePriorService = (value) =>
    setForm((current) => ({
      ...current,
      priorService: value,
      servicePeriods:
        value && !current.servicePeriods.length ? [blankServicePeriod()] : current.servicePeriods,
    }));
  const togglePriorArma = (value) =>
    setForm((current) => ({
      ...current,
      priorArma: value,
      armaUnits: value && !current.armaUnits.length ? [blankArmaUnit()] : current.armaUnits,
    }));
  const toggleInterestedUnit = (unitId, checked) =>
    setForm((current) => {
      const interestedUnitIds = checked
        ? Array.from(new Set([...current.interestedUnitIds, unitId]))
        : current.interestedUnitIds.filter((id) => id !== unitId);
      const nextUnitIds = new Set(interestedUnitIds);
      return {
        ...current,
        interestedUnitIds,
        desiredMOSIds: current.desiredMOSIds.filter((mosId) =>
          (options.mos ?? []).some((mos) => mos.id === mosId && nextUnitIds.has(mos.unitId)),
        ),
      };
    });
  const toggleDesiredMOS = (mosId, checked) =>
    setForm((current) => ({
      ...current,
      desiredMOSIds: checked
        ? Array.from(new Set([...current.desiredMOSIds, mosId]))
        : current.desiredMOSIds.filter((id) => id !== mosId),
    }));
  const updateServicePeriod = (index, field, value) =>
    setForm((current) => ({
      ...current,
      servicePeriods: current.servicePeriods.map((period, itemIndex) =>
        itemIndex === index ? { ...period, [field]: value } : period,
      ),
    }));
  const updateArmaUnit = (index, field, value) =>
    setForm((current) => ({
      ...current,
      armaUnits: current.armaUnits.map((unit, itemIndex) =>
        itemIndex === index ? { ...unit, [field]: value } : unit,
      ),
    }));

  return (
    <div className="application-form">
      <div className="form-line name-line">
        <fieldset className="name-question">
          <legend>Enter the name you wish to use.</legend>
          <div className="name-input-row">
            <input
              aria-label="First name"
              placeholder="FIRST NAME"
              value={form.firstName}
              onChange={(event) => update("firstName", event.target.value)}
            />
            <input
              aria-label="Last name"
              placeholder="LAST NAME"
              value={form.lastName}
              onChange={(event) => update("lastName", event.target.value)}
            />
          </div>
        </fieldset>
      </div>

      <BooleanLine
        checked={form.priorService}
        label="ARE YOU CURRENT OR PRIOR SERVICE?"
        onChange={togglePriorService}
      />
      {form.priorService ? (
        <div className="conditional-detail">
          <div className="repeatable-stack">
            {form.servicePeriods.map((period, index) => (
              <div className="inline-row" key={index}>
                <select
                  value={period.branch}
                  onChange={(event) => updateServicePeriod(index, "branch", event.target.value)}
                >
                  <option value="">Branch</option>
                  {(options.branches ?? []).map((branch) => (
                    <option key={branch} value={branch}>
                      {humanize(branch)}
                    </option>
                  ))}
                </select>
                <input
                  placeholder="MOS"
                  value={period.mos}
                  onChange={(event) => updateServicePeriod(index, "mos", event.target.value)}
                />
                <input
                  max="99"
                  min="0"
                  placeholder="Years"
                  type="number"
                  value={period.years}
                  onChange={(event) => updateServicePeriod(index, "years", event.target.value)}
                />
                <button
                  className="secondary-action"
                  type="button"
                  onClick={() =>
                    setForm((current) => ({
                      ...current,
                      servicePeriods: current.servicePeriods.filter(
                        (_, itemIndex) => itemIndex !== index,
                      ),
                    }))
                  }
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
          <button
            className="secondary-action compact-action"
            type="button"
            onClick={() =>
              setForm((current) => ({
                ...current,
                servicePeriods: [...current.servicePeriods, blankServicePeriod()],
              }))
            }
          >
            Add service period
          </button>
          {!form.servicePeriods.length ? (
            <p className="muted-copy">Add at least one row before submitting.</p>
          ) : null}
        </div>
      ) : null}

      <BooleanLine
        checked={form.priorArma}
        label="ARE YOU CURRENTLY OR HAVE YOU EVER BEEN IN ANOTHER ARMA UNIT BEFORE JOINING TASK FORCE 20?"
        onChange={togglePriorArma}
      />
      {form.priorArma ? (
        <div className="conditional-detail">
          <div className="repeatable-stack">
            {form.armaUnits.map((unit, index) => (
              <div className="inline-row arma-row" key={index}>
                <input
                  placeholder="Unit name"
                  value={unit.unitName}
                  onChange={(event) => updateArmaUnit(index, "unitName", event.target.value)}
                />
                <input
                  type="date"
                  value={unit.joinedAt}
                  onChange={(event) => updateArmaUnit(index, "joinedAt", event.target.value)}
                />
                <input
                  disabled={unit.stillMember}
                  type="date"
                  value={unit.leftAt}
                  onChange={(event) => updateArmaUnit(index, "leftAt", event.target.value)}
                />
                <label className="checkbox-label">
                  <input
                    checked={unit.stillMember}
                    type="checkbox"
                    onChange={(event) => updateArmaUnit(index, "stillMember", event.target.checked)}
                  />
                  Still there
                </label>
                <input
                  placeholder="Why you left"
                  value={unit.reasonLeft}
                  onChange={(event) => updateArmaUnit(index, "reasonLeft", event.target.value)}
                />
                <button
                  className="secondary-action"
                  type="button"
                  onClick={() =>
                    setForm((current) => ({
                      ...current,
                      armaUnits: current.armaUnits.filter((_, itemIndex) => itemIndex !== index),
                    }))
                  }
                >
                  Remove
                </button>
              </div>
            ))}
          </div>
          <button
            className="secondary-action compact-action"
            type="button"
            onClick={() =>
              setForm((current) => ({
                ...current,
                armaUnits: [...current.armaUnits, blankArmaUnit()],
              }))
            }
          >
            Add Arma unit
          </button>
          {!form.armaUnits.length ? (
            <p className="muted-copy">Add at least one row before submitting.</p>
          ) : null}
        </div>
      ) : null}

      <BooleanLine
        checked={form.leadership}
        label="DO YOU HAVE REAL WORLD OR ARMA LEADERSHIP EXPERIENCE?"
        onChange={(value) => update("leadership", value)}
      />
      {form.leadership ? (
        <Field label="Please describe your leadership experience">
          <textarea
            value={form.leadershipDetails}
            onChange={(event) => update("leadershipDetails", event.target.value)}
          />
        </Field>
      ) : null}

      <ChoiceList
        emptyMessage="No recruiting-open 7000-level units are available."
        getLabel={(unit) => unit.name}
        items={options.units ?? []}
        label="Which unit are you interested in joining?"
        selectedIds={form.interestedUnitIds}
        onToggle={toggleInterestedUnit}
      />
      <ChoiceList
        emptyMessage={
          selectedUnits.size
            ? "No recruiting-open MOS choices are available for the selected unit."
            : "Select an interested unit first."
        }
        getLabel={(mos) => `${mos.identifier ?? mos.key} - ${mos.name}`}
        items={mosOptions}
        label="Desired MOS"
        selectedIds={form.desiredMOSIds}
        onToggle={toggleDesiredMOS}
      />
      <Field label="HOW DID YOU HEAR ABOUT US?">
        <select value={form.source} onChange={(event) => update("source", event.target.value)}>
          <option value="">Select source</option>
          {(options.sources ?? []).map((source) => (
            <option key={source} value={source}>
              {humanize(source)}
            </option>
          ))}
        </select>
      </Field>
    </div>
  );
}

function BooleanLine({ checked, label, onChange }) {
  return (
    <div className="boolean-line">
      <span className="boolean-heading">{label}</span>
      <label className="boolean-choice">
        <input
          aria-label={`${label} Yes`}
          checked={checked}
          type="checkbox"
          onChange={(event) => onChange(event.target.checked)}
        />
        <span>YES</span>
      </label>
    </div>
  );
}

function ChoiceList({ emptyMessage, getLabel, items, label, onToggle, selectedIds }) {
  const selected = new Set(selectedIds ?? []);
  return (
    <section className="choice-section">
      <span className="choice-heading">{label}</span>
      {items.length ? (
        <div className="choice-list">
          {items.map((item) => {
            const isSelected = selected.has(item.id);
            return (
              <label className={`choice-option${isSelected ? " selected" : ""}`} key={item.id}>
                <input
                  checked={isSelected}
                  type="checkbox"
                  onChange={(event) => onToggle(item.id, event.target.checked)}
                />
                <span>{getLabel(item)}</span>
              </label>
            );
          })}
        </div>
      ) : (
        <p className="choice-empty">{emptyMessage}</p>
      )}
    </section>
  );
}

function Field({ children, helper, label }) {
  return (
    <label className="field">
      <span>{label}</span>
      {helper ? <small>{helper}</small> : null}
      {children}
    </label>
  );
}

function ReviewerApplicationDetail({
  actionState,
  application,
  detail,
  onAction,
  options,
  setActionState,
}) {
  if (detail.status === "idle") {
    return (
      <EmptyState title="No application selected" detail="Choose an application from the queue." />
    );
  }
  if (detail.status === "loading") {
    return <SkeletonRows />;
  }
  if (detail.status === "error") {
    return <EmptyState title="Application unavailable" detail={detail.error} />;
  }

  const updateAction = (field, value) =>
    setActionState((current) => ({ ...current, [field]: value }));

  return (
    <div className="detail-stack">
      <ApplicationStatusSummary application={application} />
      <ReadOnlyApplication application={application} />
      <div className="action-panel">
        <Field label="Action reason">
          <textarea
            value={actionState.reason}
            onChange={(event) => updateAction("reason", event.target.value)}
          />
        </Field>
        <Field label="Reviewer note">
          <textarea
            value={actionState.noteBody}
            onChange={(event) => updateAction("noteBody", event.target.value)}
          />
        </Field>
        <Field label="Target unit">
          <select
            value={actionState.targetUnitId}
            onChange={(event) => updateAction("targetUnitId", event.target.value)}
          >
            <option value="">Select target unit</option>
            {(options.units ?? []).map((unit) => (
              <option key={unit.id} value={unit.id}>
                {unit.name}
              </option>
            ))}
          </select>
        </Field>
        <div className="button-row">
          <button
            className="secondary-action"
            type="button"
            onClick={() => onAction("Request info", `/applications/${application.id}/request-info`)}
          >
            Request info
          </button>
          <button
            className="secondary-action"
            type="button"
            onClick={() => onAction("Recommend", `/applications/${application.id}/recommend`)}
          >
            Recommend
          </button>
          <button
            className="secondary-action"
            type="button"
            onClick={() =>
              onAction("Assign unit", `/applications/${application.id}/assign-unit`, {
                targetUnitId: actionState.targetUnitId,
              })
            }
          >
            Assign target unit
          </button>
          <button
            className="primary-action button-like"
            type="button"
            onClick={() => onAction("Accept", `/applications/${application.id}/accept`)}
          >
            Accept
          </button>
          <button
            className="danger-action"
            type="button"
            onClick={() => onAction("Reject", `/applications/${application.id}/reject`)}
          >
            Reject
          </button>
        </div>
      </div>
      <Timeline items={application.statusHistory ?? []} />
    </div>
  );
}

function ApplicationStatusSummary({ application }) {
  return (
    <KeyValueList
      items={[
        ["Applicant", applicationDisplayName(application)],
        ["Status", humanize(application.status)],
        ["Target unit", application.targetUnit?.name ?? "Not assigned"],
        ["Submitted", formatDate(application.submittedAt)],
      ]}
    />
  );
}

function ReadOnlyApplication({ application }) {
  return (
    <div className="detail-stack">
      <KeyValueList
        items={[
          ["Name", [application.firstName, application.lastName].filter(Boolean).join(" ")],
          ["Source", application.source ? humanize(application.source) : "Not recorded"],
          ["Prior/current service", application.priorService ? "Yes" : "No"],
          ["Prior Arma unit", application.priorArma ? "Yes" : "No"],
          ["Leadership", application.leadership ? application.leadershipDetails || "Yes" : "No"],
        ]}
      />
      <MiniList
        empty="No interested units recorded."
        items={(application.interestedUnits ?? []).map((entry) => entry.unit?.name)}
        title="Interested Units"
      />
      <MiniList
        empty="No desired MOS choices recorded."
        items={(application.desiredMOS ?? []).map(
          (entry) => `${entry.mos?.identifier ?? entry.mos?.key} - ${entry.mos?.name}`,
        )}
        title="Desired MOS"
      />
      <MiniList
        empty="No service periods recorded."
        items={(application.servicePeriods ?? []).map(
          (period) => `${humanize(period.branch)} | ${period.mos} | ${period.years} years`,
        )}
        title="Service Periods"
      />
      <MiniList
        empty="No prior Arma units recorded."
        items={(application.armaUnits ?? []).map(
          (unit) =>
            `${unit.unitName} | ${formatDate(unit.joinedAt)} to ${unit.stillMember ? "Present" : formatDate(unit.leftAt)} | ${unit.reasonLeft ?? "No reason recorded"}`,
        )}
        title="Prior Arma Units"
      />
    </div>
  );
}

function MiniList({ empty, items, title }) {
  const filtered = (items ?? []).filter(Boolean);
  return (
    <div className="mini-list">
      <strong>{title}</strong>
      {filtered.length ? (
        <ul>
          {filtered.map((item, index) => (
            <li key={`${title}-${index}`}>{item}</li>
          ))}
        </ul>
      ) : (
        <span>{empty}</span>
      )}
    </div>
  );
}

function Timeline({ items }) {
  if (!items?.length) {
    return <EmptyState title="No history" detail="No status history has been recorded yet." />;
  }
  return (
    <div className="mini-list">
      <strong>Status History</strong>
      <ul>
        {items.map((item) => (
          <li key={item.id}>
            {humanize(item.newStatus)} - {formatDate(item.createdAt)}
            <br />
            <span>{item.reason}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function blankApplicationForm() {
  return {
    firstName: "",
    lastName: "",
    source: "",
    priorService: false,
    servicePeriods: [],
    priorArma: false,
    armaUnits: [],
    leadership: false,
    leadershipDetails: "",
    interestedUnitIds: [],
    desiredMOSIds: [],
  };
}

function applicationToForm(application) {
  if (!application) {
    return blankApplicationForm();
  }

  return {
    firstName: application.firstName ?? "",
    lastName: application.lastName ?? "",
    source: application.source ?? "",
    priorService: Boolean(application.priorService),
    servicePeriods: (application.servicePeriods ?? []).map((period) => ({
      branch: period.branch ?? "",
      mos: period.mos ?? "",
      years: period.years == null ? "" : String(period.years),
    })),
    priorArma: Boolean(application.priorArma),
    armaUnits: (application.armaUnits ?? []).map((unit) => ({
      unitName: unit.unitName ?? "",
      joinedAt: dateInputValue(unit.joinedAt),
      leftAt: dateInputValue(unit.leftAt),
      stillMember: Boolean(unit.stillMember),
      reasonLeft: unit.reasonLeft ?? "",
    })),
    leadership: Boolean(application.leadership),
    leadershipDetails: application.leadershipDetails ?? "",
    interestedUnitIds: (application.interestedUnits ?? []).map((entry) => entry.unitId),
    desiredMOSIds: (application.desiredMOS ?? []).map((entry) => entry.mosId),
  };
}

function blankServicePeriod() {
  return {
    branch: "",
    mos: "",
    years: "",
  };
}

function blankArmaUnit() {
  return {
    unitName: "",
    joinedAt: "",
    leftAt: "",
    stillMember: false,
    reasonLeft: "",
  };
}

function applicationDisplayName(application) {
  const legalName = [application?.firstName, application?.lastName].filter(Boolean).join(" ");
  return legalName || application?.account?.displayName || "Unnamed applicant";
}

function formatDate(value) {
  if (!value) {
    return "Not recorded";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return String(value);
  }

  return new Intl.DateTimeFormat(undefined, {
    day: "2-digit",
    month: "short",
    year: "numeric",
  }).format(date);
}

function dateInputValue(value) {
  if (!value) {
    return "";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return date.toISOString().slice(0, 10);
}

function JsonPreview({ data }) {
  const rows = Object.entries(flattenPreview(data)).slice(0, 8);
  return <KeyValueList items={rows.map(([key, value]) => [humanize(key), value])} />;
}

function MetricPanel({ label, value }) {
  return (
    <section className="metric-panel">
      <span>{label}</span>
      <strong>{value}</strong>
    </section>
  );
}

function PanelHeader({ title }) {
  return (
    <div className="panel-header">
      <h3>{title}</h3>
    </div>
  );
}

function KeyValueList({ items }) {
  return (
    <dl className="key-value-list">
      {items.map(([key, value]) => (
        <div key={key}>
          <dt>{key}</dt>
          <dd>{String(value ?? "Not recorded")}</dd>
        </div>
      ))}
    </dl>
  );
}

function EmptyState({ title, detail }) {
  return (
    <div className="empty-state">
      <Shield size={22} />
      <strong>{title}</strong>
      <span>{detail}</span>
    </div>
  );
}

function SkeletonRows() {
  return (
    <div className="skeleton-stack" aria-label="Loading">
      <span />
      <span />
      <span />
    </div>
  );
}

function LoadingScreen() {
  return (
    <div className="center-screen">
      <div className="tf20-mark large">
        <img src={tf20Crest} alt="" />
      </div>
      <div className="loading-bar" />
    </div>
  );
}

function AuthScreen({ error }) {
  return (
    <div className="auth-screen">
      <div className="auth-panel">
        <div className="tf20-mark large">
          <img src={tf20Crest} alt="" />
        </div>
        <div>
          <span className="eyebrow">Task Force 20</span>
          <h1>Protected Personnel System</h1>
        </div>
        <p>{error}</p>
        <a className="primary-action" href="/auth/discord/start">
          Continue with Discord
        </a>
      </div>
    </div>
  );
}

function iconFor(iconKey) {
  return ICONS[iconKey] ?? Shield;
}

function filterPages(pages, query) {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return pages;

  return pages.filter((item) => item.label.toLowerCase().includes(normalized));
}

function initials(value) {
  const parts = String(value).trim().split(/\s+/).filter(Boolean);
  return (parts[0]?.[0] ?? "T").concat(parts[1]?.[0] ?? "F").toUpperCase();
}

function humanize(value) {
  return String(value ?? "Unknown")
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replaceAll("_", " ")
    .trim();
}

function flattenPreview(data) {
  if (!data || typeof data !== "object") return { value: data };

  return Object.fromEntries(
    Object.entries(data)
      .filter(
        ([, value]) => value == null || ["string", "number", "boolean"].includes(typeof value),
      )
      .map(([key, value]) => [key, value ?? "Not recorded"]),
  );
}
