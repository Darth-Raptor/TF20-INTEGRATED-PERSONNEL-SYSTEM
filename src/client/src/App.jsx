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
        : summary.payload.data.permissions ?? [];
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

async function fetchJson(path) {
  try {
    const response = await fetch(path, {
      credentials: "include",
      headers: { Accept: "application/json" },
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
      <button className="mobile-menu-button" type="button" aria-label="Toggle navigation" onClick={onOpenMenu}>
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
      return <DashboardWorkspace navigation={navigation} session={session} onNavigate={onNavigate} />;
    case "user_profile":
      return <ProfileWorkspace session={session} />;
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
      <MetricPanel label="Gate State" value={session.gateState ?? session.summary?.gateState ?? "Unknown"} />
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
      <MetricPanel label="Gate" value={session.gateState ?? session.summary?.gateState ?? "Unknown"} />
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

function ApplicationsWorkspace() {
  const resource = useApiResource("/applications/review");

  return (
    <div className="workspace-grid">
      <MetricPanel label="Workspace" value="Recruiting" />
      <MetricPanel label="Status" value={resource.label} />
      <section className="wide-panel">
        <PanelHeader title="Applications" />
        <ResourceContent resource={resource} type="application-list" />
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
  const [state, setState] = useState({ status: "loading", label: "Loading", data: null, error: null });

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
    return <EmptyState title="No personnel records" detail="The current scope returned no profiles." />;
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

function ApplicationList({ items }) {
  if (!items.length) {
    return <EmptyState title="No applications" detail="The review queue is empty." />;
  }

  return (
    <div className="record-list">
      {items.map((item) => (
        <div className="record-row" key={item.id}>
          <div>
            <strong>
              {item.account?.displayName ??
                item.account?.authIdentities?.[0]?.displayName ??
                item.account?.authIdentities?.[0]?.username ??
                item.id}
            </strong>
            <span>{item.targetUnit?.name ?? "Unknown unit"}</span>
          </div>
          <span className="status-pill">{humanize(item.status)}</span>
        </div>
      ))}
    </div>
  );
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
      .filter(([, value]) => value == null || ["string", "number", "boolean"].includes(typeof value))
      .map(([key, value]) => [key, value ?? "Not recorded"]),
  );
}
