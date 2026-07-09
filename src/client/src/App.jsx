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
  accountStatusLabel,
  applicationStatusLabel,
  billetDisplayLabel,
  humanizeIdentifier,
  mosDisplayLabel,
  personDisplayName,
  personnelStatusLabel,
  rankDisplayLabel,
  standingDisplayLabel,
  trainingCourseDisplayLabel,
  trainingOutcomeLabel,
  unitDisplayLabel,
} from "../../shared/display-labels.mjs";
import { APPLICATION_AVAILABILITY_COPY } from "../../shared/application-availability.mjs";
import {
  EVENT_ATTENDANCE_SCOPE_OPTIONS,
  EVENT_LOCATION_OPTIONS,
  EVENT_TYPE_OPTIONS,
  buildCalendarMonth,
  eventAttendanceScopeLabel,
  eventDateKeys,
  eventLocationLabel,
  eventTypeLabel,
  localMonthKey,
  nextCalendarMonth,
  previousCalendarMonth,
} from "../../shared/events.mjs";
import {
  findNavigationNodeByPath,
  findSiteMapNodeByPath,
  isSectionDashboardMatch,
  resolveSectionLandingPath,
  resolveVisibleNavigation,
} from "../../shared/site-map.mjs";
import { buildPersonnelProfileViewModel } from "../../shared/profile-view-model.mjs";
import airAssaultImage from "./assets/public-page/air-assault.webp";
import casualtyEvacImage from "./assets/public-page/casualty-evac.webp";
import nightRaidImage from "./assets/public-page/night-raid.png";
import nightSkyImage from "./assets/public-page/night-sky.png";
import rangeTrainingImage from "./assets/public-page/range-training.png";
import tf20HeroImage from "./assets/public-page/tf20-hero.png";
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

const DISCORD_INVITE_URL = "https://discord.gg/cdGHUztUDz";
const APPLY_AUTH_URL = "/auth/discord/start?returnTo=/user/application";

const DIFFERENTIATORS = [
  {
    title: "Realism with consequences",
    body: "Task Force 20 uses a custom persistence mod built for the unit, allowing single missions to continue across multiple play sessions with saved player positions, vehicle locations, inventories, health, damage, and more.",
  },
  {
    title: "Flexible operation times",
    body: "The Task Force operates around Central time, with operations commonly landing on Tuesdays, Thursdays, and Saturdays around 1900 CST. Individual units can schedule missions at times that fit their teams instead of being locked to one rigid schedule.",
  },
  {
    title: "Deployment rotations",
    body: "Campaigns are persistent instead of one-off missions. Logistics, ammunition, medical supplies, and mission outcomes carry forward until a campaign ends and the Task Force rotates home for training, testing, and reset time.",
  },
];

const FEATURE_STORIES = [
  {
    title: "Immersive special operations campaigns",
    body: "Detailed Eden-built missions and unit-specific mods push gameplay beyond basic interaction loops, keeping the focus on tactics, communication, and believable mission flow.",
    image: nightRaidImage,
    imageAlt: "Task Force 20 operators conducting a night raid under night vision.",
  },
  {
    title: "Training that supports the next deployment",
    body: "Home rotations create room to sharpen skills, test gear, practice new procedures, and prepare the next campaign without burning out the teams running it.",
    image: rangeTrainingImage,
    imageAlt: "Task Force 20 members training beside a range target.",
  },
  {
    title: "Joint force capability",
    body: "Ground teams, aviation, medical support, and specialist roles combine to recreate special operations with structure and purpose.",
    image: casualtyEvacImage,
    imageAlt: "Task Force 20 members evacuating a casualty during an operation.",
  },
];

const LOOKING_FOR = [
  "Mature players who want a fully immersive and detailed experience.",
  "Players who value realism over easy gameplay.",
  "Members driven to build something new and push the boundaries of Arma 3.",
  "Leaders willing to invest in others and grow a team.",
];

const REQUIREMENTS = [
  "Must be at least 17 years old.",
  "Must speak fluent English.",
  "Must have a working microphone or headset, with no open mic or speakers.",
  "Must have at least 100 Arma 3 hours.",
];

const CURRENT_UNITS = [
  "A Co, 1/75th Ranger Regiment",
  "1 Troop, A Squadron, 1st SFOD-Delta",
  "B Co, 2/160th SOAR",
  "TEAM 1, RRC, RSTB, 75th RR",
];

const FUTURE_UNITS = ["1st Joint Special Operations Air Component"];

const ROSTER_SORT_OPTIONS = [
  { value: "name", label: "Name" },
  { value: "status", label: "Status" },
  { value: "unit", label: "Unit" },
  { value: "rank", label: "Rank" },
  { value: "mos", label: "MOS" },
];

export function App() {
  const [path, setPath] = useState(() => window.location.pathname);
  const session = useSession(path !== "/");

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

  if (path === "/") {
    return <PublicLandingPage />;
  }

  if (session.status === "loading") {
    return <LoadingScreen />;
  }

  if (session.status === "signed-out") {
    return <AuthScreen error={session.error} />;
  }

  return <PortalShell path={path} session={session} onNavigate={navigate} />;
}

function useSession(enabled = true) {
  const [state, setState] = useState({ status: "loading", error: null });

  useEffect(() => {
    if (!enabled) {
      setState({ status: "idle", error: null });
      return undefined;
    }

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
  }, [enabled]);

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

function PublicLandingPage() {
  const [openings, setOpenings] = useState({ status: "loading", items: [] });

  useEffect(() => {
    const previousTitle = document.title;
    document.title = "Task Force 20 | Arma 3 Realism Unit";
    return () => {
      document.title = previousTitle;
    };
  }, []);

  useEffect(() => {
    let isActive = true;

    fetchJson("/public/openings").then((result) => {
      if (!isActive) return;
      if (!result.ok) {
        setOpenings({ status: "error", items: [] });
        return;
      }
      setOpenings({ status: "ready", items: result.payload.data ?? [] });
    });

    return () => {
      isActive = false;
    };
  }, []);

  return (
    <div className="public-page">
      <header className="public-nav" aria-label="Task Force 20 public navigation">
        <a className="public-brand" href="/" aria-label="Task Force 20 homepage">
          <img src={tf20Crest} alt="" />
          <span>Task Force 20</span>
        </a>
        <nav className="public-nav-links" aria-label="Page sections">
          <a href="#different">What makes us different</a>
          <a href="#requirements">Requirements</a>
          <a href="#openings">Openings</a>
        </nav>
        <a className="public-nav-action" href="/portal">
          Login
        </a>
      </header>

      <main>
        <section className="public-hero" style={{ "--hero-image": `url(${tf20HeroImage})` }}>
          <div className="public-hero-overlay">
            <div className="public-hero-copy">
              <span className="public-kicker">Arma 3 Realism Unit</span>
              <h1>Task Force 20</h1>
              <p>
                Task Force 20 is an Arma 3 real-sim unit focused on realism, tactics, and immersion.
                With detailed Eden-built missions and custom systems that push gameplay deeper than
                basic interaction, our goal is to provide the most accurate recreation of special
                operations possible in Arma 3.
              </p>
              <div className="public-actions">
                <a className="public-primary-action" href={APPLY_AUTH_URL}>
                  Apply
                </a>
                <a className="public-secondary-action" href={DISCORD_INVITE_URL}>
                  Join our Discord
                </a>
              </div>
            </div>
          </div>
        </section>

        <section className="public-section public-intro-section" id="different">
          <div className="public-section-heading">
            <span className="public-kicker">What Makes Us Different</span>
            <h2>Persistent campaigns, realistic tactics, and teams that can breathe.</h2>
          </div>
          <div className="public-card-grid">
            {DIFFERENTIATORS.map((item) => (
              <article className="public-info-card" key={item.title}>
                <h3>{item.title}</h3>
                <p>{item.body}</p>
              </article>
            ))}
          </div>
        </section>

        <section className="public-feature-stack" aria-label="Task Force 20 operations">
          {FEATURE_STORIES.map((feature) => (
            <article className="public-feature" key={feature.title}>
              <img src={feature.image} alt={feature.imageAlt} />
              <div>
                <h2>{feature.title}</h2>
                <p>{feature.body}</p>
              </div>
            </article>
          ))}
        </section>

        <section className="public-media-band" aria-label="Task Force 20 deployment imagery">
          <img src={nightSkyImage} alt="Task Force 20 members silhouetted under a night sky." />
          <img src={airAssaultImage} alt="Task Force 20 helicopters flying over an urban area." />
        </section>

        <section className="public-section public-roster-section" id="requirements">
          <div className="public-section-heading">
            <span className="public-kicker">Recruiting</span>
            <h2>Who we are looking for</h2>
          </div>
          <div className="public-list-layout">
            <PublicList title="Ideal Members" items={LOOKING_FOR} />
            <PublicList title="Requirements" items={REQUIREMENTS} />
          </div>
        </section>

        <section className="public-section public-openings-section" id="openings">
          <div className="public-section-heading">
            <span className="public-kicker">Current Structure</span>
            <h2>Units and MOS openings</h2>
          </div>
          <div className="public-list-layout three-column">
            <PublicList title="Current Units" items={CURRENT_UNITS} />
            <PublicOpeningsList state={openings} />
            <PublicList title="Future Units" items={FUTURE_UNITS} />
          </div>
        </section>

        <section className="public-final-cta">
          <span className="public-kicker">Ready to step in?</span>
          <h2>Start your Task Force 20 application.</h2>
          <p>
            Apply through Discord authentication, then continue into the TF20 portal to complete
            your applicant profile and application. Discord membership is required before
            application access opens.
          </p>
          <div className="public-actions">
            <a className="public-primary-action" href={APPLY_AUTH_URL}>
              Apply
            </a>
            <a className="public-secondary-action" href={DISCORD_INVITE_URL}>
              Join our Discord
            </a>
          </div>
        </section>
      </main>
    </div>
  );
}

function PublicList({ items, title }) {
  return (
    <article className="public-list-card">
      <h3>{title}</h3>
      <ul>
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </article>
  );
}

function PublicOpeningsList({ state }) {
  return (
    <article className="public-list-card public-openings-card">
      <h3>Current MOS Openings</h3>
      {state.status === "loading" ? <p>Loading openings...</p> : null}
      {state.status === "error" ? <p>Current openings are unavailable right now.</p> : null}
      {state.status === "ready" && !state.items.length ? (
        <p>No current MOS openings posted.</p>
      ) : null}
      {state.status === "ready" && state.items.length ? (
        <div className="public-openings-groups">
          {state.items.map((group) => (
            <div className="public-openings-group" key={group.unit.id}>
              <strong>{group.unit.name}</strong>
              <ul>
                {(group.mos ?? []).map((row) => (
                  <li key={row.id}>{mosDisplayLabel(row)}</li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      ) : null}
    </article>
  );
}

function PortalShell({ path, session, onNavigate }) {
  const [detailCollapsed, setDetailCollapsed] = useState(true);
  const [navOpen, setNavOpen] = useState(false);
  const navigation = session.navigation ?? { defaultPath: null, sections: [] };
  const defaultPath = navigation.defaultPath;
  const sectionLandingPath = resolveSectionLandingPath(navigation, path);
  const redirectPath =
    path === "/portal" && defaultPath
      ? defaultPath
      : sectionLandingPath && sectionLandingPath !== path
        ? sectionLandingPath
        : null;
  const effectivePath = redirectPath ?? path;

  useEffect(() => {
    if (redirectPath) {
      onNavigate(redirectPath, { replace: true });
    }
  }, [redirectPath, onNavigate]);

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
        aria-label="Default page"
        title="Default page"
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
  const rawDisplayName =
    session.summary?.account?.displayName ??
    session.summary?.authIdentity?.displayName ??
    session.summary?.authIdentity?.username ??
    "TF20 user";
  const displayName = personDisplayName({ fullName: rawDisplayName }, "TF20 user");
  const title =
    activeDefinition.id === "user_application" ? "Enlistment Application" : activeDefinition.label;

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
        <h2>{title}</h2>
      </div>
      <div className="account-strip">
        <div className="account-avatar" aria-hidden="true">
          {initials(displayName)}
        </div>
        <div className="account-copy">
          <strong>{displayName}</strong>
          <span>{accountStatusLabel(session.summary?.account?.status)}</span>
        </div>
        <a className="logout-button" href="/auth/logout" aria-label="Log out" title="Log out">
          <LogOut size={18} />
        </a>
      </div>
    </header>
  );
}

function Workspace({ path, session, siteMapMatch, visibleMatch, onNavigate }) {
  if (!visibleMatch) {
    return <AccessUnavailableWorkspace path={path} siteMapMatch={siteMapMatch} />;
  }

  switch (visibleMatch.node.id) {
    case "user_profile":
      return <ProfileWorkspace session={session} />;
    case "user_application":
      return <ApplicantApplicationWorkspace />;
    case "user_training":
      return <UserTrainingWorkspace />;
    case "user_events":
      return <UserEventsWorkspace onNavigate={onNavigate} />;
    case "user_event_detail":
      return <UserEventsWorkspace eventId={visibleMatch.params?.eventId} onNavigate={onNavigate} />;
    case "staff_unit":
      return <StaffUnitWorkspace />;
    case "staff_events":
      return <StaffEventsWorkspace onNavigate={onNavigate} />;
    case "staff_event_detail":
      return (
        <StaffEventsWorkspace eventId={visibleMatch.params?.eventId} onNavigate={onNavigate} />
      );
    case "staff_personnel_management":
      return (
        <StaffPersonnelManagementWorkspace
          subpages={visibleMatch.page.subpages ?? []}
          onNavigate={onNavigate}
        />
      );
    case "staff_personnel_profile_detail":
      return (
        <StaffPersonnelProfileWorkspace
          personnelId={visibleMatch.params?.personnelId}
          onNavigate={onNavigate}
        />
      );
    case "staff_applicant_review":
      return <StaffApplicantReviewWorkspace onNavigate={onNavigate} />;
    case "staff_applicant_review_detail":
      return (
        <StaffApplicantReviewWorkspace
          applicationId={visibleMatch.params?.applicationId}
          onNavigate={onNavigate}
        />
      );
    case "recruiting_dashboard":
      return <RecruitingDashboardWorkspace session={session} onNavigate={onNavigate} />;
    case "recruiting_applications":
      return <ApplicationsWorkspace session={session} onNavigate={onNavigate} />;
    case "recruiting_application_detail":
      return (
        <ApplicationsWorkspace
          applicationId={visibleMatch.params?.applicationId}
          session={session}
          onNavigate={onNavigate}
        />
      );
    case "recruiting_records":
      return <ApplicationsWorkspace mode="records" session={session} onNavigate={onNavigate} />;
    case "recruiting_record_detail":
      return (
        <ApplicationsWorkspace
          applicationId={visibleMatch.params?.applicationId}
          mode="records"
          session={session}
          onNavigate={onNavigate}
        />
      );
    case "training_records":
      return <TrainingRecordsWorkspace />;
    case "admin_roles":
      return <AdminRolesWorkspace />;
    case "admin_user_records":
      return <AdminUserRecordsWorkspace onNavigate={onNavigate} />;
    case "admin_user_record_detail":
      return (
        <AdminUserRecordsWorkspace
          accountId={visibleMatch.params?.accountId}
          onNavigate={onNavigate}
        />
      );
    default:
      return <ContractPlaceholder match={visibleMatch} />;
  }
}

function RecruitingDashboardWorkspace({ session, onNavigate }) {
  const [queue, setQueue] = useState({ status: "loading", items: [], error: null });
  const currentAccountId = session?.summary?.account?.id ?? "";

  useEffect(() => {
    let isActive = true;

    async function loadQueue() {
      const result = await fetchJson("/applications/review");
      if (!isActive) return;

      if (!result.ok) {
        setQueue({
          status: "error",
          items: [],
          error: result.payload?.error?.message ?? "Unable to load recruiting dashboard.",
        });
        return;
      }

      setQueue({ status: "ready", items: result.payload.items ?? [], error: null });
    }

    loadQueue();
    return () => {
      isActive = false;
    };
  }, []);

  const stats = recruiterApplicationStats(queue.items, currentAccountId);

  return (
    <div className="workspace-grid">
      <MetricPanel
        label="UNCLAIMED APPLICATIONS"
        value={queue.status === "loading" ? "..." : String(stats.unclaimed)}
      />
      <MetricPanel
        label="YOUR ACTIVE APLLICATIONS"
        value={queue.status === "loading" ? "..." : String(stats.claimedByCurrentUser)}
      />
      <section className="wide-panel">
        <PanelHeader title="Applications" />
        {queue.status === "error" ? (
          <EmptyState title="Recruiting dashboard unavailable" detail={queue.error} />
        ) : (
          <div className="module-grid">
            <PageTile
              item={{
                label: "Applications",
                icon: "applications",
              }}
              meta="Open recruiter queue"
              onNavigate={() => onNavigate("/recruiting/applications")}
            />
          </div>
        )}
      </section>
    </div>
  );
}

function recruiterApplicationStats(items, currentAccountId) {
  return (items ?? []).reduce(
    (stats, item) => {
      if (!item.claimedByAccountId) {
        stats.unclaimed += 1;
      }
      if (item.claimedByAccountId && item.claimedByAccountId === currentAccountId) {
        stats.claimedByCurrentUser += 1;
      }
      return stats;
    },
    { unclaimed: 0, claimedByCurrentUser: 0 },
  );
}

function AdminRolesWorkspace() {
  const [options, setOptions] = useState({
    status: "loading",
    accounts: [],
    roles: [],
    error: null,
  });
  const [selectedAccountId, setSelectedAccountId] = useState("");
  const [detail, setDetail] = useState({ status: "idle", account: null, error: null });
  const [roleId, setRoleId] = useState("");
  const [reason, setReason] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    let active = true;
    async function loadOptions() {
      const result = await fetchJson("/admin/role-management");
      if (!active) return;
      if (!result.ok) {
        setOptions({
          status: "error",
          accounts: [],
          roles: [],
          error: result.payload?.error?.message ?? "Unable to load role management.",
        });
        return;
      }
      const data = result.payload.data;
      setOptions({
        status: "ready",
        accounts: data.accounts ?? [],
        roles: data.roles ?? [],
        error: null,
      });
      setSelectedAccountId((current) => current || data.accounts?.[0]?.id || "");
    }
    loadOptions();
    return () => {
      active = false;
    };
  }, []);

  const loadAccount = async (accountId) => {
    if (!accountId) {
      setDetail({ status: "idle", account: null, error: null });
      return;
    }
    setDetail({ status: "loading", account: null, error: null });
    const result = await fetchJson(`/admin/role-management/${encodeURIComponent(accountId)}`);
    if (!result.ok) {
      setDetail({
        status: "error",
        account: null,
        error: result.payload?.error?.message ?? "Unable to load account roles.",
      });
      return;
    }
    setDetail({ status: "ready", account: result.payload.data, error: null });
  };

  useEffect(() => {
    loadAccount(selectedAccountId);
  }, [selectedAccountId]);

  const performRoleAction = async (label, request) => {
    if (!reason.trim()) {
      setMessage("A role-change reason is required.");
      return;
    }
    setMessage(`${label}...`);
    const result = await request();
    if (!result.ok) {
      setMessage(result.payload?.error?.message ?? `${label} failed.`);
      return;
    }
    setDetail({ status: "ready", account: result.payload.data, error: null });
    setRoleId("");
    setReason("");
    setMessage(`${label} complete.`);
  };

  if (options.status === "loading") return <SkeletonRows />;
  if (options.status === "error") {
    return <EmptyState title="Role management unavailable" detail={options.error} />;
  }

  const account = detail.account;
  const assignedRoleIds = new Set(
    (account?.roleAssignments ?? []).map((assignment) => assignment.roleId),
  );
  const availableRoles = options.roles.filter((role) => !assignedRoleIds.has(role.id));

  return (
    <div className="workspace-grid">
      <section className="wide-panel application-panel">
        <ApplicationReviewSection title="USER">
          <Field label="Select user">
            <select
              value={selectedAccountId}
              onChange={(event) => {
                setSelectedAccountId(event.target.value);
                setMessage("");
                setRoleId("");
                setReason("");
              }}
            >
              {options.accounts.map((item) => (
                <option key={item.id} value={item.id}>
                  {roleAccountOptionLabel(item)}
                </option>
              ))}
            </select>
          </Field>
        </ApplicationReviewSection>

        {detail.status === "loading" ? <SkeletonRows /> : null}
        {detail.status === "error" ? (
          <EmptyState title="Account roles unavailable" detail={detail.error} />
        ) : null}
        {detail.status === "ready" && account ? (
          <div className="detail-stack application-review-stack admin-role-stack">
            <ApplicationReviewSection title="CURRENT ROLES">
              <RoleAssignmentTable
                account={account}
                onRemove={(assignmentId) =>
                  performRoleAction("Role removal", () =>
                    fetchJson(
                      `/admin/role-management/${encodeURIComponent(account.id)}/assignments/${encodeURIComponent(assignmentId)}`,
                      { method: "DELETE", body: { reason } },
                    ),
                  )
                }
                reasonReady={Boolean(reason.trim())}
              />
            </ApplicationReviewSection>
            <ApplicationReviewSection title="ADD ROLE">
              <div className="form-grid">
                <Field label="Role">
                  <select value={roleId} onChange={(event) => setRoleId(event.target.value)}>
                    <option value="">Choose one</option>
                    {availableRoles.map((role) => {
                      const needsUnit = ["unit-staff", "trainer"].includes(role.key);
                      const disabled = needsUnit && !account.personnelProfile?.currentUnitId;
                      return (
                        <option disabled={disabled} key={role.id} value={role.id}>
                          {role.name}
                          {disabled ? " - current unit required" : ""}
                        </option>
                      );
                    })}
                  </select>
                </Field>
                <Field label="Current personnel unit">
                  <input
                    disabled
                    value={account.personnelProfile?.currentUnit?.name ?? "Unassigned"}
                  />
                </Field>
              </div>
              <Field label="Audit reason">
                <textarea value={reason} onChange={(event) => setReason(event.target.value)} />
              </Field>
              <div className="button-row">
                <button
                  className="primary-action button-like"
                  disabled={!roleId || !reason.trim()}
                  type="button"
                  onClick={() =>
                    performRoleAction("Role assignment", () =>
                      fetchJson(
                        `/admin/role-management/${encodeURIComponent(account.id)}/assignments`,
                        { method: "POST", body: { roleId, reason } },
                      ),
                    )
                  }
                >
                  Add role
                </button>
              </div>
              {message ? <p className="muted-copy">{message}</p> : null}
            </ApplicationReviewSection>
          </div>
        ) : null}
      </section>
    </div>
  );
}

function RoleAssignmentTable({ account, onRemove, reasonReady }) {
  const assignments = account.roleAssignments ?? [];
  if (!assignments.length) {
    return (
      <EmptyState title="No active roles" detail="This account has no active role assignments." />
    );
  }
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Role</th>
            <th>Scope</th>
            <th>Assigned</th>
            <th>
              <span className="visually-hidden">Remove role</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {assignments.map((assignment) => (
            <tr key={assignment.id}>
              <td>{assignment.role?.name ?? "Unknown role"}</td>
              <td>{roleScopeLabel(assignment)}</td>
              <td>{formatDate(assignment.startsAt)}</td>
              <td className="application-open-cell">
                <button
                  className="danger-action compact-action"
                  disabled={!reasonReady}
                  type="button"
                  onClick={() => onRemove(assignment.id)}
                >
                  Remove
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function AdminUserRecordsWorkspace({ accountId = "", onNavigate }) {
  if (accountId) {
    return <AdminUserRecordDetailWorkspace accountId={accountId} onNavigate={onNavigate} />;
  }

  return <AdminUserRecordListWorkspace onNavigate={onNavigate} />;
}

function AdminUserRecordListWorkspace({ onNavigate }) {
  const [resource, setResource] = useState({ status: "loading", items: [], error: null });

  useEffect(() => {
    let isActive = true;

    async function load() {
      const result = await fetchJson("/admin/user-records");
      if (!isActive) return;

      if (!result.ok) {
        setResource({
          status: "error",
          items: [],
          error: result.payload?.error?.message ?? "Unable to load user records.",
        });
        return;
      }

      setResource({ status: "ready", items: result.payload.items ?? [], error: null });
    }

    load();
    return () => {
      isActive = false;
    };
  }, []);

  return (
    <div className="workspace-grid">
      <section className="wide-panel">
        <PanelHeader title="Admin User Records" />
        <AdminUserRecordList
          error={resource.error}
          items={resource.items}
          loading={resource.status === "loading"}
          onOpen={(nextAccountId) =>
            onNavigate(`/admin/user-records/${encodeURIComponent(nextAccountId)}`)
          }
        />
      </section>
    </div>
  );
}

function AdminUserRecordDetailWorkspace({ accountId, onNavigate }) {
  const [detail, setDetail] = useState({
    status: "loading",
    record: null,
    options: null,
    permissions: {},
    error: null,
  });
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState(() => blankAdminUserRecordForm());
  const [reason, setReason] = useState("");
  const [noteBody, setNoteBody] = useState("");
  const [message, setMessage] = useState("");

  const load = async () => {
    if (!accountId) {
      setDetail({
        status: "error",
        record: null,
        options: null,
        permissions: {},
        error: "Account ID is required.",
      });
      return;
    }

    setDetail({
      status: "loading",
      record: null,
      options: null,
      permissions: {},
      error: null,
    });

    const result = await fetchJson(`/admin/user-records/${encodeURIComponent(accountId)}`);
    if (!result.ok) {
      setDetail({
        status: "error",
        record: null,
        options: null,
        permissions: {},
        error: result.payload?.error?.message ?? "Unable to load the user record.",
      });
      return;
    }

    const record = result.payload.data;
    setDetail({
      status: "ready",
      record,
      options: result.payload.options ?? {},
      permissions: result.payload.permissions ?? {},
      error: null,
    });
    setForm(adminUserRecordToForm(record));
    setEditing(false);
    setReason("");
    setMessage("");
  };

  useEffect(() => {
    load();
  }, [accountId]);

  const canUpdate = Boolean(detail.permissions?.canUpdate);
  const record = detail.record;
  const profile = record?.personnelProfile ?? null;
  const viewModel = profile ? buildPersonnelProfileViewModel(profile) : null;

  const save = async () => {
    setMessage("Saving user record...");
    const result = await fetchJson(`/admin/user-records/${encodeURIComponent(accountId)}`, {
      method: "PATCH",
      body: {
        accountStatus: form.accountStatus,
        personnelStatus: form.personnelStatus,
        reason,
      },
    });

    if (!result.ok) {
      setMessage(result.payload?.error?.message ?? "Unable to save the user record.");
      return;
    }

    const nextRecord = result.payload.data;
    setDetail((current) => ({
      ...current,
      record: nextRecord,
      options: result.payload.options ?? current.options,
      permissions: result.payload.permissions ?? current.permissions,
    }));
    setForm(adminUserRecordToForm(nextRecord));
    setEditing(false);
    setReason("");
    setMessage("User record saved.");
  };

  const saveNote = async () => {
    setMessage("Saving note...");
    const result = await fetchJson(`/admin/user-records/${encodeURIComponent(accountId)}/notes`, {
      method: "POST",
      body: { noteBody },
    });

    if (!result.ok) {
      setMessage(result.payload?.error?.message ?? "Unable to save note.");
      return;
    }

    const nextRecord = result.payload.data;
    setDetail((current) => ({
      ...current,
      record: nextRecord,
      options: result.payload.options ?? current.options,
      permissions: result.payload.permissions ?? current.permissions,
    }));
    setNoteBody("");
    setMessage("Note saved.");
  };

  if (detail.status === "loading") {
    return <SkeletonRows />;
  }

  if (detail.status === "error") {
    return <EmptyState title="User record unavailable" detail={detail.error} />;
  }

  const actions = (
    <>
      <button
        className="secondary-action"
        type="button"
        onClick={() => onNavigate("/admin/user-records")}
      >
        Back to user records
      </button>
      {editing ? (
        <>
          <button
            className="primary-action button-like"
            disabled={!canUpdate || !reason.trim()}
            type="button"
            onClick={save}
          >
            Save
          </button>
          <button
            className="secondary-action"
            type="button"
            onClick={() => {
              setForm(adminUserRecordToForm(record));
              setEditing(false);
              setReason("");
              setMessage("");
            }}
          >
            Cancel
          </button>
        </>
      ) : (
        <button
          className="secondary-action"
          disabled={!canUpdate}
          type="button"
          onClick={() => setEditing(true)}
        >
          Edit
        </button>
      )}
    </>
  );

  return (
    <div className="workspace-grid">
      <section className="wide-panel personnel-profile-card">
        <div className="personnel-profile-stack">
          <PersonnelProfileHeading actions={actions} />
          <ApplicationReviewSection title="ACCOUNT">
            <div className="profile-format-grid admin-user-record-grid">
              <ReadOnlyField label="Name">{adminUserRecordName(record)}</ReadOnlyField>
              <ReadOnlyField label="Discord User">
                {record.authIdentities?.[0]?.username ?? "Not recorded"}
              </ReadOnlyField>
              <ReadOnlyField label="Discord ID">
                {record.authIdentities?.[0]?.providerAccountId ?? "Not recorded"}
              </ReadOnlyField>
              <ReadOnlyField label="Latest Application">
                {record.latestApplication
                  ? applicationStatusLabel(record.latestApplication.status)
                  : "None"}
              </ReadOnlyField>
            </div>
          </ApplicationReviewSection>

          {editing ? (
            <ApplicationReviewSection title="ADMINISTRATIVE STATUS">
              <div className="profile-format-grid admin-user-record-grid">
                <Field label="Account Status">
                  <select
                    value={form.accountStatus}
                    onChange={(event) =>
                      setForm((current) => ({ ...current, accountStatus: event.target.value }))
                    }
                  >
                    {(detail.options?.accountStatuses ?? []).map((status) => (
                      <option key={status} value={status}>
                        {accountStatusLabel(status)}
                      </option>
                    ))}
                  </select>
                </Field>
                {profile ? (
                  <Field label="Personnel Status">
                    <select
                      value={form.personnelStatus}
                      onChange={(event) =>
                        setForm((current) => ({ ...current, personnelStatus: event.target.value }))
                      }
                    >
                      {(detail.options?.personnelStatuses ?? []).map((status) => (
                        <option key={status} value={status}>
                          {personnelStatusLabel(status)}
                        </option>
                      ))}
                    </select>
                  </Field>
                ) : (
                  <ReadOnlyField label="Personnel Status">Not on personnel roster</ReadOnlyField>
                )}
                <ReadOnlyField label="Standing">
                  {profile
                    ? standingDisplayLabel(
                        derivePersonnelStanding(form.personnelStatus || profile.status),
                      )
                    : "Not on personnel roster"}
                </ReadOnlyField>
                <ReadOnlyField label="Submitted">
                  {formatDate(record.latestApplication?.submittedAt)}
                </ReadOnlyField>
              </div>
              <Field label="Audit Reason">
                <textarea value={reason} onChange={(event) => setReason(event.target.value)} />
              </Field>
            </ApplicationReviewSection>
          ) : (
            <ApplicationReviewSection title="ADMINISTRATIVE STATUS">
              <div className="profile-format-grid admin-user-record-grid">
                <ReadOnlyField label="Account Status">
                  {accountStatusLabel(record.status)}
                </ReadOnlyField>
                <ReadOnlyField label="Personnel Status">
                  {profile ? personnelStatusLabel(profile.status) : "Not on personnel roster"}
                </ReadOnlyField>
                <ReadOnlyField label="Standing">
                  {profile ? standingDisplayLabel(profile.goodStanding) : "Not on personnel roster"}
                </ReadOnlyField>
                <ReadOnlyField label="Submitted">
                  {formatDate(record.latestApplication?.submittedAt)}
                </ReadOnlyField>
              </div>
            </ApplicationReviewSection>
          )}

          {viewModel ? <PersonnelProfileSections viewModel={viewModel} /> : null}

          <ApplicationReviewSection title="SYSTEM ADMIN NOTES">
            <Field label="Add Note">
              <textarea value={noteBody} onChange={(event) => setNoteBody(event.target.value)} />
            </Field>
            <div className="button-row">
              <button
                className="primary-action button-like"
                disabled={!noteBody.trim()}
                type="button"
                onClick={saveNote}
              >
                Save note
              </button>
            </div>
            <AdminUserRecordNotesHistory items={record.adminNotes ?? []} />
          </ApplicationReviewSection>
        </div>
        {!canUpdate ? (
          <p className="muted-copy profile-edit-message">
            You can view this record, but you do not have user-record update permission.
          </p>
        ) : null}
        {message ? <p className="muted-copy profile-edit-message">{message}</p> : null}
      </section>
    </div>
  );
}

function PersonnelProfileSections({ viewModel }) {
  return (
    <>
      <ProfileFieldGrid items={viewModel.profileFields} />
      <ApplicationReviewSection title="QUALIFICATIONS">
        <ProfileRecordList items={viewModel.qualifications} />
      </ApplicationReviewSection>
      <ApplicationReviewSection title="AWARDS">
        <ProfileRecordList items={viewModel.awards} />
      </ApplicationReviewSection>
      <ApplicationReviewSection title="RIBBONS">
        <ProfileRecordList items={viewModel.ribbons} />
      </ApplicationReviewSection>
      <ApplicationReviewSection title="ACHIEVEMENTS">
        <ProfileRecordList items={viewModel.achievements} />
      </ApplicationReviewSection>
    </>
  );
}

function AdminUserRecordList({ error = null, items, loading = false, onOpen = null }) {
  if (loading) {
    return <SkeletonRows />;
  }

  if (error) {
    return <EmptyState title="User records unavailable" detail={error} />;
  }

  if (!items.length) {
    return (
      <EmptyState
        title="No user records"
        detail="No accounts currently match the admin user-record criteria."
      />
    );
  }

  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Name</th>
            <th>Account Status</th>
            <th>Personnel Status</th>
            <th>
              <span className="visually-hidden">Open user record</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.id}>
              <td>
                <div className="admin-user-record-name">
                  <strong>{adminUserRecordName(item)}</strong>
                  <small>
                    {item.authIdentities?.[0]?.username ?? "No Discord identity"}
                    {item.authIdentities?.[0]?.providerAccountId
                      ? ` / ${item.authIdentities[0].providerAccountId}`
                      : ""}
                  </small>
                </div>
              </td>
              <td>{accountStatusLabel(item.status)}</td>
              <td>
                {item.personnelProfile?.status
                  ? personnelStatusLabel(item.personnelProfile.status)
                  : "Not on personnel roster"}
              </td>
              <td className="application-open-cell">
                <button
                  className="secondary-action compact-action"
                  disabled={!onOpen}
                  type="button"
                  onClick={() => onOpen?.(item.id)}
                >
                  OPEN
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function AdminUserRecordNotesHistory({ items }) {
  if (!items?.length) {
    return <EmptyState title="No notes" detail="No admin notes have been recorded yet." />;
  }

  return (
    <div className="status-history-list">
      <ul>
        {items.map((item) => (
          <li key={item.id}>
            {adminNoteAuthorLabel(item)} - {formatDateTime(item.createdAt)}
            <br />
            <span>{item.body}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ProfileWorkspace({ session }) {
  const resource = useApiResource("/personnel/self");

  if (resource.status === "loading") {
    return <SkeletonRows />;
  }

  if (resource.status === "error") {
    return <EmptyState title="Profile unavailable" detail={resource.error} />;
  }

  const profile = resource.data?.data ?? null;
  const viewModel = buildPersonnelProfileViewModel(profile, session.summary);

  return (
    <div className="workspace-grid">
      <PersonnelProfileCard viewModel={viewModel} />
    </div>
  );
}

function PersonnelProfileCard({ viewModel }) {
  return (
    <section className="wide-panel personnel-profile-card">
      <PersonnelProfileReadOnly viewModel={viewModel} />
    </section>
  );
}

function PersonnelProfileReadOnly({ actions = null, viewModel }) {
  return (
    <div className="personnel-profile-stack">
      <PersonnelProfileHeading actions={actions} />
      <PersonnelProfileSections viewModel={viewModel} />
    </div>
  );
}

function PersonnelProfileHeading({ actions = null }) {
  return actions ? (
    <div className="personnel-profile-heading">
      <div className="button-row">{actions}</div>
    </div>
  ) : null;
}

function ProfileFieldGrid({ items }) {
  return (
    <section className="application-review-section profile-format-card">
      <div className="profile-format-grid">
        {items.map(([label, value]) => (
          <ReadOnlyField key={label} label={label}>
            {value}
          </ReadOnlyField>
        ))}
      </div>
    </section>
  );
}

function ProfileRecordList({ items }) {
  if (!items.length) {
    return null;
  }

  return (
    <ul className="profile-record-list">
      {items.map((item) => (
        <li key={item}>{item}</li>
      ))}
    </ul>
  );
}

function StaffPersonnelManagementWorkspace({ subpages, onNavigate }) {
  const resource = useApiResource("/personnel");
  const [sortBy, setSortBy] = useState("name");
  const sortedResource = useMemo(() => {
    if (resource.status !== "ready" || !resource.data?.items) {
      return resource;
    }

    return {
      ...resource,
      data: {
        ...resource.data,
        items: sortPersonnelRosterItems(resource.data.items, sortBy),
      },
    };
  }, [resource, sortBy]);

  return (
    <div className="workspace-grid">
      <section className="wide-panel">
        <PanelHeader title="Staff Personnel Roster" />
        <Field label="Sort by">
          <select value={sortBy} onChange={(event) => setSortBy(event.target.value)}>
            {ROSTER_SORT_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </Field>
        <ResourceContent
          onOpenPersonnel={(id) =>
            onNavigate(`/staff/personnel-management/${encodeURIComponent(id)}`)
          }
          resource={sortedResource}
          type="personnel-list"
        />
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

function StaffPersonnelProfileWorkspace({ personnelId, onNavigate }) {
  const [detail, setDetail] = useState({
    status: "loading",
    profile: null,
    options: null,
    permissions: {},
    error: null,
  });
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState(() => blankPersonnelProfileForm());
  const [message, setMessage] = useState("");

  const load = async () => {
    if (!personnelId) {
      setDetail({
        status: "error",
        profile: null,
        options: null,
        permissions: {},
        error: "Personnel profile ID is required.",
      });
      return;
    }

    setDetail({
      status: "loading",
      profile: null,
      options: null,
      permissions: {},
      error: null,
    });
    const result = await fetchJson(`/personnel/${encodeURIComponent(personnelId)}`);
    if (!result.ok) {
      setDetail({
        status: "error",
        profile: null,
        options: null,
        permissions: {},
        error: result.payload?.error?.message ?? "Unable to load personnel profile.",
      });
      return;
    }

    const profile = result.payload.data;
    setDetail({
      status: "ready",
      profile,
      options: result.payload.options ?? {},
      permissions: result.payload.permissions ?? {},
      error: null,
    });
    setForm(personnelProfileToForm(profile));
    setEditing(false);
    setMessage("");
  };

  useEffect(() => {
    load();
  }, [personnelId]);

  const updateForm = (field, value) => setForm((current) => ({ ...current, [field]: value }));
  const save = async () => {
    setMessage("Saving profile...");
    const result = await fetchJson(`/personnel/${encodeURIComponent(personnelId)}`, {
      method: "PATCH",
      body: {
        ...form,
        reason: "Staff profile edit",
      },
    });

    if (!result.ok) {
      setMessage(result.payload?.error?.message ?? "Unable to save profile.");
      return;
    }

    const profile = result.payload.data;
    setDetail((current) => ({ ...current, profile }));
    setForm(personnelProfileToForm(profile));
    setEditing(false);
    setMessage("Profile saved.");
  };

  if (detail.status === "loading") {
    return <SkeletonRows />;
  }

  if (detail.status === "error") {
    return <EmptyState title="Personnel profile unavailable" detail={detail.error} />;
  }

  const profile = detail.profile;
  const viewModel = buildPersonnelProfileViewModel(profile);
  const canUpdate = Boolean(detail.permissions?.canUpdate);
  const actions = (
    <>
      <button
        className="secondary-action"
        type="button"
        onClick={() => onNavigate("/staff/personnel-management")}
      >
        Back to personnel
      </button>
      {editing ? (
        <>
          <button className="primary-action button-like" type="button" onClick={save}>
            Save
          </button>
          <button
            className="secondary-action"
            type="button"
            onClick={() => {
              setForm(personnelProfileToForm(profile));
              setEditing(false);
              setMessage("");
            }}
          >
            Cancel
          </button>
        </>
      ) : (
        <button
          className="secondary-action"
          disabled={!canUpdate}
          type="button"
          onClick={() => setEditing(true)}
        >
          Edit
        </button>
      )}
    </>
  );

  return (
    <div className="workspace-grid">
      <section className="wide-panel personnel-profile-card">
        {editing ? (
          <div className="personnel-profile-stack">
            <PersonnelProfileHeading actions={actions} />
            <PersonnelProfileEditForm
              form={form}
              onChange={updateForm}
              options={detail.options ?? {}}
              viewModel={viewModel}
            />
          </div>
        ) : (
          <PersonnelProfileReadOnly actions={actions} viewModel={viewModel} />
        )}
        {!canUpdate ? (
          <p className="muted-copy profile-edit-message">
            You can view this profile, but you do not have personnel update permission.
          </p>
        ) : null}
        {message ? <p className="muted-copy profile-edit-message">{message}</p> : null}
      </section>
    </div>
  );
}

function PersonnelProfileEditForm({ form, onChange, options, viewModel }) {
  const derivedStanding = standingDisplayLabel(derivePersonnelStanding(form.status || ""));

  return (
    <>
      <section className="application-review-section profile-format-card">
        <div className="profile-format-grid">
          <Field label="Rank">
            <select
              value={form.currentRankId}
              onChange={(event) => onChange("currentRankId", event.target.value)}
            >
              <option value="">Unassigned</option>
              {(options.ranks ?? []).map((rank) => (
                <option key={rank.id} value={rank.id}>
                  {rankDisplayLabel(rank)}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Name">
            <input value={form.name} onChange={(event) => onChange("name", event.target.value)} />
          </Field>
          <ReadOnlyField label="TIS">{profileFieldValue(viewModel, "TIS")}</ReadOnlyField>
          <ReadOnlyField label="TIG">{profileFieldValue(viewModel, "TIG")}</ReadOnlyField>
          <Field label="Unit">
            <select
              value={form.currentUnitId}
              onChange={(event) => onChange("currentUnitId", event.target.value)}
            >
              <option value="">Unassigned</option>
              {(options.units ?? []).map((unit) => (
                <option key={unit.id} value={unit.id}>
                  {unitDisplayLabel(unit)}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Assignment">
            <select
              value={form.currentBilletId}
              onChange={(event) => onChange("currentBilletId", event.target.value)}
            >
              <option value="">Unassigned</option>
              {(options.billets ?? []).map((billet) => (
                <option key={billet.id} value={billet.id}>
                  {billetDisplayLabel(billet)}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Primary MOS">
            <select
              value={form.currentMOSId}
              onChange={(event) => onChange("currentMOSId", event.target.value)}
            >
              <option value="">Unassigned</option>
              {(options.mos ?? []).map((mos) => (
                <option key={mos.id} value={mos.id}>
                  {mosDisplayLabel(mos)}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Secondary MOS">
            <select
              value={form.currentSecondaryMOSId}
              onChange={(event) => onChange("currentSecondaryMOSId", event.target.value)}
            >
              <option value="">None</option>
              {(options.mos ?? []).map((mos) => (
                <option key={mos.id} value={mos.id}>
                  {mosDisplayLabel(mos)}
                </option>
              ))}
            </select>
          </Field>
        </div>
      </section>
      <ApplicationReviewSection title="ADMINISTRATIVE STATUS">
        <div className="form-grid">
          <Field label="Status">
            <select
              value={form.status}
              onChange={(event) => onChange("status", event.target.value)}
            >
              {(options.statuses ?? []).map((status) => (
                <option key={status} value={status}>
                  {personnelStatusLabel(status)}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Standing">
            <div className="readonly-field">
              <strong>{derivedStanding}</strong>
            </div>
          </Field>
        </div>
      </ApplicationReviewSection>
      <ApplicationReviewSection title="QUALIFICATIONS">
        <ProfileRecordList items={viewModel.qualifications} />
      </ApplicationReviewSection>
      <ApplicationReviewSection title="AWARDS">
        <ProfileRecordList items={viewModel.awards} />
      </ApplicationReviewSection>
      <ApplicationReviewSection title="RIBBONS">
        <ProfileRecordList items={viewModel.ribbons} />
      </ApplicationReviewSection>
      <ApplicationReviewSection title="ACHIEVEMENTS">
        <ProfileRecordList items={viewModel.achievements} />
      </ApplicationReviewSection>
    </>
  );
}

function ApplicantApplicationWorkspace() {
  const [resource, setResource] = useState({ status: "loading", data: null, error: null });
  const [form, setForm] = useState(() => blankApplicationForm());
  const [message, setMessage] = useState("");
  const [openedDocumentKeys, setOpenedDocumentKeys] = useState([]);
  const [checkedDocumentKeys, setCheckedDocumentKeys] = useState([]);

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
    const documents = data.intakeDocuments ?? data.application?.intakeDocuments ?? [];
    const agreedKeys = documents
      .filter((document) => document.status === "agreed")
      .map((document) => document.key);
    setResource({ status: "ready", data, error: null });
    setForm(applicationToForm(data.application));
    setOpenedDocumentKeys(agreedKeys);
    setCheckedDocumentKeys(agreedKeys);
  };

  useEffect(() => {
    load();
  }, []);

  const application = resource.data?.application ?? null;
  const intakeDocuments = resource.data?.intakeDocuments ?? application?.intakeDocuments ?? [];
  const options = resource.data?.options ?? {
    sources: [],
    branches: [],
    timeZones: [],
    availabilitySlots: [],
    units: [],
    mos: [],
  };
  const editable = !application || ["Draft", "MoreInfoRequested"].includes(application.status);
  const terminal = ["Converted", "Denied", "Withdrawn", "Closed"].includes(application?.status);
  const intakeComplete =
    intakeDocuments.length > 0 && intakeDocuments.every((document) => document.status === "agreed");
  const intakeGateRequired = editable && !intakeComplete;

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

  const recordIntakeAgreements = async () => {
    await action("Agreement save", () =>
      fetchJson("/applications/me/intake-agreements", {
        method: "POST",
        body: { documentKeys: checkedDocumentKeys },
      }),
    );
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
        {message ? (
          <div className="form-message">
            <strong>{message}</strong>
          </div>
        ) : null}
        {application ? <ApplicationStatusSummary application={application} /> : null}
        {intakeGateRequired ? (
          <IntakeDocumentsGate
            checkedDocumentKeys={checkedDocumentKeys}
            documents={intakeDocuments}
            onAgree={recordIntakeAgreements}
            onCheck={setCheckedDocumentKeys}
            onOpen={setOpenedDocumentKeys}
            openedDocumentKeys={openedDocumentKeys}
          />
        ) : editable ? (
          <ApplicationForm form={form} options={options} setForm={setForm} />
        ) : (
          <ReadOnlyApplication application={application} />
        )}
        <div className="button-row">
          {editable && !intakeGateRequired ? (
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

function UserTrainingWorkspace() {
  const resource = useApiResource("/training/self");

  return (
    <div className="workspace-grid">
      <section className="wide-panel application-panel">
        <PanelHeader title="Training" />
        <UserTrainingContent resource={resource} />
      </section>
    </div>
  );
}

function UserTrainingContent({ resource }) {
  if (resource.status === "loading") {
    return <SkeletonRows />;
  }

  if (resource.status === "error") {
    return <EmptyState title="Training unavailable" detail={resource.error} />;
  }

  const items = resource.data?.items ?? [];
  if (!items.length) {
    return (
      <EmptyState
        title="No training records"
        detail="No completed or failed training records were found."
      />
    );
  }

  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Course</th>
            <th>Completion Date</th>
            <th>Status</th>
            <th>Instructor/Recorded By</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.id}>
              <td>{trainingCourseDisplayLabel(item.course ?? item.session?.course)}</td>
              <td>{formatDate(item.completedAt ?? item.session?.completedAt)}</td>
              <td>
                <span className="status-pill">{trainingOutcomeLabel(item.outcome)}</span>
              </td>
              <td>
                {accountDisplayName(item.instructorAccount ?? item.recordedByAccount, "Unknown")}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function UserEventsWorkspace({ eventId = null, onNavigate }) {
  return <EventsWorkspace mode="user" eventId={eventId} onNavigate={onNavigate} />;
}

function StaffEventsWorkspace({ eventId = null, onNavigate }) {
  return <EventsWorkspace mode="staff" eventId={eventId} onNavigate={onNavigate} />;
}

function EventsWorkspace({ mode, eventId = null, onNavigate }) {
  if (eventId) {
    return <EventDetailWorkspace eventId={eventId} mode={mode} onNavigate={onNavigate} />;
  }

  return <EventCalendarWorkspace mode={mode} onNavigate={onNavigate} />;
}

function EventCalendarWorkspace({ mode, onNavigate }) {
  const staffMode = mode === "staff";
  const [month, setMonth] = useState(() => localMonthKey(new Date()));
  const [calendar, setCalendar] = useState({ status: "loading", items: [], error: null });
  const [options, setOptions] = useState({
    status: staffMode ? "loading" : "ready",
    data: { units: [] },
    error: null,
  });
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [form, setForm] = useState(() => blankEventForm());
  const [message, setMessage] = useState("");
  const monthView = useMemo(() => buildCalendarMonth(month), [month]);
  const manageableUnits = options.data?.units ?? [];
  const singleUnit = manageableUnits.length === 1 ? manageableUnits[0] : null;

  const loadCalendar = async (nextMonth = month) => {
    setCalendar((current) => ({ ...current, status: "loading", error: null }));
    const result = await fetchJson(`/events?month=${encodeURIComponent(nextMonth)}`);
    if (!result.ok) {
      setCalendar({
        status: "error",
        items: [],
        error: result.payload?.error?.message ?? "Unable to load events.",
      });
      return;
    }

    setCalendar({
      status: "ready",
      items: result.payload.items ?? [],
      error: null,
    });
  };

  const loadOptions = async () => {
    if (!staffMode) {
      return;
    }

    setOptions((current) => ({ ...current, status: "loading", error: null }));
    const result = await fetchJson("/events/options");
    if (!result.ok) {
      setOptions({
        status: "error",
        data: { units: [] },
        error: result.payload?.error?.message ?? "Unable to load event options.",
      });
      return;
    }

    setOptions({
      status: "ready",
      data: result.payload.data ?? { units: [] },
      error: null,
    });
  };

  useEffect(() => {
    loadCalendar(month);
  }, [month]);

  useEffect(() => {
    if (staffMode) {
      loadOptions();
    }
  }, [staffMode]);

  useEffect(() => {
    if (singleUnit && !form.sourceUnitId) {
      setForm((current) => ({ ...current, sourceUnitId: singleUnit.id }));
    }
  }, [singleUnit, form.sourceUnitId]);

  const submitCreate = async () => {
    setMessage("Posting event...");
    const result = await fetchJson("/events", {
      method: "POST",
      body: buildEventPayload(form, singleUnit?.id ?? ""),
    });
    if (!result.ok) {
      setMessage(result.payload?.error?.message ?? "Unable to post event.");
      return;
    }

    setMessage("Event posted.");
    setShowCreateForm(false);
    setForm(blankEventForm(singleUnit?.id ?? ""));
    await loadCalendar(month);
  };

  return (
    <div className="workspace-grid">
      <section className="wide-panel application-panel">
        {message ? (
          <div className="form-message">
            <strong>{message}</strong>
          </div>
        ) : null}
        <div className="detail-stack application-review-stack">
          {staffMode ? (
            <div className="button-row">
              <button
                className="secondary-action"
                type="button"
                onClick={() => {
                  setShowCreateForm((current) => !current);
                  setMessage("");
                  if (showCreateForm) {
                    setForm(blankEventForm(singleUnit?.id ?? ""));
                  }
                }}
              >
                {showCreateForm ? "Close create event" : "Create event"}
              </button>
            </div>
          ) : null}

          {staffMode && showCreateForm ? (
            <ApplicationReviewSection title="CREATE EVENT">
              {options.status === "loading" ? <SkeletonRows /> : null}
              {options.status === "error" ? (
                <EmptyState title="Event options unavailable" detail={options.error} />
              ) : null}
              {options.status === "ready" ? (
                <>
                  <EventEditorFields
                    form={form}
                    onChange={(field, value) =>
                      setForm((current) => ({ ...current, [field]: value }))
                    }
                    sourceUnitLockedLabel={singleUnit?.name ?? ""}
                    units={manageableUnits}
                  />
                  <div className="button-row">
                    <button
                      className="primary-action button-like"
                      type="button"
                      onClick={submitCreate}
                    >
                      Post event
                    </button>
                    <button
                      className="secondary-action"
                      type="button"
                      onClick={() => {
                        setForm(blankEventForm(singleUnit?.id ?? ""));
                        setShowCreateForm(false);
                        setMessage("");
                      }}
                    >
                      Cancel
                    </button>
                  </div>
                </>
              ) : null}
            </ApplicationReviewSection>
          ) : null}

          <ApplicationReviewSection title="EVENT CALENDAR">
            <EventCalendarToolbar
              monthLabel={monthView.label}
              onNext={() => setMonth((current) => nextCalendarMonth(current))}
              onPrevious={() => setMonth((current) => previousCalendarMonth(current))}
            />
            {calendar.status === "loading" ? <SkeletonRows /> : null}
            {calendar.status === "error" ? (
              <EmptyState title="Events unavailable" detail={calendar.error} />
            ) : null}
            {calendar.status === "ready" ? (
              <>
                {!calendar.items.length ? (
                  <p className="muted-copy">No posted events were found for this month.</p>
                ) : null}
                <EventMonthCalendar
                  items={calendar.items}
                  monthView={monthView}
                  onOpenEvent={(item) =>
                    onNavigate(eventPathForMode(mode, encodeURIComponent(item.id)))
                  }
                />
              </>
            ) : null}
          </ApplicationReviewSection>
        </div>
      </section>
    </div>
  );
}

function EventDetailWorkspace({ eventId, mode, onNavigate }) {
  const staffMode = mode === "staff";
  const [detail, setDetail] = useState({ status: "loading", event: null, error: null });
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState(() => blankEventForm());
  const [message, setMessage] = useState("");

  const loadDetail = async () => {
    setDetail({ status: "loading", event: null, error: null });
    const result = await fetchJson(`/events/${encodeURIComponent(eventId)}`);
    if (!result.ok) {
      setDetail({
        status: "error",
        event: null,
        error: result.payload?.error?.message ?? "Unable to load event detail.",
      });
      return;
    }

    const event = result.payload.data ?? null;
    setDetail({ status: "ready", event, error: null });
    setForm(eventToForm(event));
    setEditing(false);
  };

  useEffect(() => {
    loadDetail();
  }, [eventId]);

  const event = detail.event;

  const saveEdit = async () => {
    if (!event) {
      return;
    }

    setMessage("Saving event...");
    const result = await fetchJson(`/events/${encodeURIComponent(event.id)}`, {
      method: "PATCH",
      body: buildEventPayload(form, event.sourceUnitId),
    });
    if (!result.ok) {
      setMessage(result.payload?.error?.message ?? "Unable to save event.");
      return;
    }

    setMessage("Event updated.");
    await loadDetail();
  };

  const cancelScheduledEvent = async () => {
    if (!event) {
      return;
    }

    setMessage("Cancelling event...");
    const result = await fetchJson(`/events/${encodeURIComponent(event.id)}/cancel`, {
      method: "POST",
    });
    if (!result.ok) {
      setMessage(result.payload?.error?.message ?? "Unable to cancel event.");
      return;
    }

    setMessage("Event cancelled.");
    await loadDetail();
  };

  const handleRsvp = async (action) => {
    if (!event) {
      return;
    }

    const path =
      action === "signup"
        ? `/events/${encodeURIComponent(event.id)}/signup`
        : `/events/${encodeURIComponent(event.id)}/withdraw`;
    setMessage(action === "signup" ? "Signing up..." : "Withdrawing...");
    const result = await fetchJson(path, { method: "POST" });
    if (!result.ok) {
      setMessage(result.payload?.error?.message ?? "Unable to update RSVP.");
      return;
    }

    setMessage(action === "signup" ? "You are signed up for this event." : "RSVP withdrawn.");
    await loadDetail();
  };

  const actions = (
    <div className="button-row">
      <button
        className="secondary-action"
        type="button"
        onClick={() => onNavigate(eventListPathForMode(mode))}
      >
        Back to events
      </button>
      {staffMode && event?.permissions?.canEdit && !editing ? (
        <button className="secondary-action" type="button" onClick={() => setEditing(true)}>
          Edit
        </button>
      ) : null}
      {staffMode && editing ? (
        <>
          <button className="primary-action button-like" type="button" onClick={saveEdit}>
            Save
          </button>
          <button
            className="secondary-action"
            type="button"
            onClick={() => {
              setForm(eventToForm(event));
              setEditing(false);
              setMessage("");
            }}
          >
            Cancel
          </button>
        </>
      ) : null}
    </div>
  );

  return (
    <div className="workspace-grid">
      <section className="wide-panel application-panel">
        {message ? (
          <div className="form-message">
            <strong>{message}</strong>
          </div>
        ) : null}
        {detail.status === "loading" ? <SkeletonRows /> : null}
        {detail.status === "error" ? (
          <EmptyState title="Event unavailable" detail={detail.error} />
        ) : null}
        {detail.status === "ready" && event ? (
          <div className="detail-stack application-review-stack">
            {actions}
            {editing ? (
              <ApplicationReviewSection title="EDIT EVENT">
                <EventEditorFields
                  form={form}
                  onChange={(field, value) =>
                    setForm((current) => ({ ...current, [field]: value }))
                  }
                  sourceUnitLockedLabel={event.sourceUnit?.name ?? "Unassigned"}
                  units={[]}
                />
              </ApplicationReviewSection>
            ) : null}
            <ApplicationReviewSection title="EVENT DETAILS">
              <EventDetailSummary event={event} />
              {staffMode && event.permissions?.canCancel ? (
                <div className="button-row">
                  <button className="danger-action" type="button" onClick={cancelScheduledEvent}>
                    Cancel event
                  </button>
                </div>
              ) : null}
            </ApplicationReviewSection>
            {!staffMode ? (
              <ApplicationReviewSection title="RSVP">
                <EventRsvpPanel event={event} onRsvp={handleRsvp} />
              </ApplicationReviewSection>
            ) : null}
            {staffMode ? (
              <ApplicationReviewSection title="SIGNUP ROSTER">
                <EventSignupRosterTable items={event.signups ?? []} />
              </ApplicationReviewSection>
            ) : null}
          </div>
        ) : null}
      </section>
    </div>
  );
}

function EventCalendarToolbar({ monthLabel, onNext, onPrevious }) {
  return (
    <div className="event-toolbar">
      <strong className="event-month-label">{monthLabel}</strong>
      <div className="event-toolbar-actions">
        <button className="secondary-action compact-action" type="button" onClick={onPrevious}>
          Previous
        </button>
        <button className="secondary-action compact-action" type="button" onClick={onNext}>
          Next
        </button>
      </div>
    </div>
  );
}

function EventMonthCalendar({ items, monthView, onOpenEvent }) {
  const eventsByDay = useMemo(() => groupEventsByDay(items), [items]);
  const weeks = useMemo(() => chunkCalendarDays(monthView.days), [monthView.days]);
  const weekdayLabels = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

  return (
    <div className="event-calendar-shell">
      <div className="event-calendar-grid event-calendar-weekdays" role="presentation">
        {weekdayLabels.map((label) => (
          <div className="event-weekday" key={label}>
            {label}
          </div>
        ))}
      </div>
      <div className="event-calendar-weeks">
        {weeks.map((week, weekIndex) => (
          <div className="event-calendar-grid" key={weekIndex}>
            {week.map((day) => {
              const dayEvents = eventsByDay.get(day.key) ?? [];
              const visibleEvents = dayEvents.slice(0, 3);
              const overflowCount = Math.max(dayEvents.length - visibleEvents.length, 0);

              return (
                <div
                  className={`event-day-cell${day.inMonth ? "" : " out-of-month"}${day.isToday ? " today" : ""}`}
                  key={day.key}
                >
                  <div className="event-day-header">
                    <span className="event-day-number">{day.dayOfMonth}</span>
                  </div>
                  <div className="event-day-events">
                    {visibleEvents.map((item) => (
                      <button
                        className="event-pill"
                        key={`${day.key}-${item.id}`}
                        type="button"
                        onClick={() => onOpenEvent(item)}
                      >
                        <time>{formatEventTime(item.startsAt)}</time>
                        <span>{item.title}</span>
                      </button>
                    ))}
                    {overflowCount > 0 ? (
                      <span className="event-overflow">+{overflowCount} more</span>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

function EventDetailSummary({ event }) {
  return (
    <div className="event-detail-stack">
      <div className="event-detail-heading">
        <strong>{event.title}</strong>
        <p className="event-description">{event.details}</p>
      </div>
      <KeyValueList
        items={[
          ["Type", eventTypeLabel(event.eventType)],
          ["Location", eventLocationLabel(event.location)],
          ["Attendance", eventAttendanceScopeLabel(event.attendanceScope)],
          ["Owning Unit", unitDisplayLabel(event.sourceUnit)],
          ["Start", formatDateTime(event.startsAt)],
          ["Estimated End", formatDateTime(event.endsAt)],
          ["Status", humanize(event.status)],
        ]}
      />
    </div>
  );
}

function EventRsvpPanel({ event, onRsvp }) {
  const statusMessage = eventRsvpStatusMessage(event);

  return (
    <div className="application-review-actions">
      <p className="muted-copy">{statusMessage}</p>
      <div className="button-row">
        {event.permissions?.canSignup ? (
          <button
            className="primary-action button-like"
            type="button"
            onClick={() => onRsvp("signup")}
          >
            Sign up
          </button>
        ) : null}
        {event.permissions?.canWithdraw ? (
          <button className="secondary-action" type="button" onClick={() => onRsvp("withdraw")}>
            Withdraw
          </button>
        ) : null}
      </div>
    </div>
  );
}

function EventSignupRosterTable({ items }) {
  if (!items.length) {
    return <EmptyState title="No signups" detail="No members have signed up for this event yet." />;
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
            <th>Signed Up</th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.id}>
              <td>
                {personDisplayName({ fullName: item.personnelProfile?.name }, "Unnamed member")}
              </td>
              <td>{personnelStatusLabel(item.personnelProfile?.status)}</td>
              <td>{unitDisplayLabel(item.personnelProfile?.currentUnit)}</td>
              <td>{rankDisplayLabel(item.personnelProfile?.currentRank, { compact: true })}</td>
              <td>{formatDateTime(item.signedUpAt ?? item.createdAt)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function EventEditorFields({ form, onChange, sourceUnitLockedLabel = "", units }) {
  return (
    <>
      <div className="event-form-grid">
        <Field label="Event Name">
          <input value={form.title} onChange={(event) => onChange("title", event.target.value)} />
        </Field>
        <Field label="Event Type">
          <select
            value={form.eventType}
            onChange={(event) => onChange("eventType", event.target.value)}
          >
            <option value="">Choose one</option>
            {EVENT_TYPE_OPTIONS.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Location">
          <select
            value={form.location}
            onChange={(event) => onChange("location", event.target.value)}
          >
            <option value="">Choose one</option>
            {EVENT_LOCATION_OPTIONS.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Attendance Restriction">
          <select
            value={form.attendanceScope}
            onChange={(event) => onChange("attendanceScope", event.target.value)}
          >
            <option value="">Choose one</option>
            {EVENT_ATTENDANCE_SCOPE_OPTIONS.map((option) => (
              <option key={option.id} value={option.id}>
                {option.label}
              </option>
            ))}
          </select>
        </Field>
        {sourceUnitLockedLabel ? (
          <ReadOnlyField label="Owning Unit">{sourceUnitLockedLabel}</ReadOnlyField>
        ) : (
          <Field label="Owning Unit">
            <select
              value={form.sourceUnitId}
              onChange={(event) => onChange("sourceUnitId", event.target.value)}
            >
              <option value="">Choose one</option>
              {units.map((unit) => (
                <option key={unit.id} value={unit.id}>
                  {unit.name}
                </option>
              ))}
            </select>
          </Field>
        )}
        <Field label="Start Date And Time">
          <input
            type="datetime-local"
            value={form.startsAt}
            onChange={(event) => onChange("startsAt", event.target.value)}
          />
        </Field>
        <Field label="Estimated End Date And Time">
          <input
            type="datetime-local"
            value={form.endsAt}
            onChange={(event) => onChange("endsAt", event.target.value)}
          />
        </Field>
      </div>
      <Field label="Short Description">
        <textarea
          value={form.details}
          onChange={(event) => onChange("details", event.target.value)}
        />
      </Field>
    </>
  );
}

function TrainingRecordsWorkspace() {
  const [state, setState] = useState({
    status: "loading",
    options: { courses: [], personnel: [] },
    sessions: [],
    error: null,
  });
  const [form, setForm] = useState(() => blankTrainingForm());
  const [message, setMessage] = useState("");
  const [editingSessionId, setEditingSessionId] = useState("");
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setState((current) => ({ ...current, status: "loading", error: null }));
    const [optionsResult, sessionsResult] = await Promise.all([
      fetchJson("/training/options"),
      fetchJson("/training/sessions"),
    ]);

    if (!optionsResult.ok || !sessionsResult.ok) {
      setState({
        status: "error",
        options: { courses: [], personnel: [] },
        sessions: [],
        error:
          optionsResult.payload?.error?.message ??
          sessionsResult.payload?.error?.message ??
          "Unable to load training records.",
      });
      return;
    }

    setState({
      status: "ready",
      options: optionsResult.payload?.data ?? { courses: [], personnel: [] },
      sessions: sessionsResult.payload?.items ?? [],
      error: null,
    });
  };

  useEffect(() => {
    load();
  }, []);

  const resetForm = () => {
    setForm(blankTrainingForm());
    setEditingSessionId("");
  };

  const submit = async () => {
    setSaving(true);
    setMessage(editingSessionId ? "Saving training session..." : "Recording training session...");
    const result = await fetchJson(
      editingSessionId ? `/training/sessions/${editingSessionId}` : "/training/sessions",
      {
        method: editingSessionId ? "PATCH" : "POST",
        body: form,
      },
    );
    setSaving(false);

    if (!result.ok) {
      setMessage(result.payload?.error?.message ?? "Training session save failed.");
      return;
    }

    setMessage(editingSessionId ? "Training session updated." : "Training session recorded.");
    resetForm();
    await load();
  };

  const editSession = async (sessionId) => {
    setMessage("Loading training session...");
    const result = await fetchJson(`/training/sessions/${sessionId}`);
    if (!result.ok) {
      setMessage(result.payload?.error?.message ?? "Unable to load training session.");
      return;
    }

    const session = result.payload?.data;
    setEditingSessionId(session.id);
    setForm(trainingSessionToForm(session));
    setMessage("Editing training session.");
  };

  if (state.status === "loading") {
    return <SkeletonRows />;
  }

  if (state.status === "error") {
    return <EmptyState title="Training unavailable" detail={state.error} />;
  }

  return (
    <div className="workspace-grid">
      <section className="wide-panel application-panel">
        {message ? (
          <div className="form-message">
            <strong>{message}</strong>
          </div>
        ) : null}
        <div className="application-form">
          <ApplicationReviewSection title="COURSE">
            <div className="application-section-row">
              <Field label="Course">
                <select
                  value={form.courseId}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, courseId: event.target.value }))
                  }
                >
                  <option value="">Choose one</option>
                  {(state.options.courses ?? []).map((course) => (
                    <option key={course.id} value={course.id}>
                      {trainingCourseDisplayLabel(course)}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Completion Date">
                <input
                  type="date"
                  value={form.completedAt}
                  onChange={(event) =>
                    setForm((current) => ({ ...current, completedAt: event.target.value }))
                  }
                />
              </Field>
            </div>
          </ApplicationReviewSection>
          <ApplicationReviewSection title="ATTENDEES">
            <TrainingAttendeeEditor
              attendees={form.attendees}
              personnel={state.options.personnel ?? []}
              setForm={setForm}
            />
          </ApplicationReviewSection>
          <ApplicationReviewSection title="SESSION NOTES">
            <Field label="Notes">
              <textarea
                value={form.notes}
                onChange={(event) =>
                  setForm((current) => ({ ...current, notes: event.target.value }))
                }
              />
            </Field>
          </ApplicationReviewSection>
          <div className="button-row">
            <button
              className="primary-action button-like"
              disabled={saving}
              type="button"
              onClick={submit}
            >
              {editingSessionId ? "Save training session" : "Record training session"}
            </button>
            {editingSessionId ? (
              <button
                className="secondary-action"
                disabled={saving}
                type="button"
                onClick={resetForm}
              >
                Cancel
              </button>
            ) : null}
          </div>
          <ApplicationReviewSection title="RECORDED SESSIONS">
            <TrainingSessionList items={state.sessions} onEdit={editSession} />
          </ApplicationReviewSection>
        </div>
      </section>
    </div>
  );
}

function TrainingAttendeeEditor({ attendees, personnel, setForm }) {
  const selectedPersonnelIds = new Set(attendees.map((attendee) => attendee.personnelProfileId));
  const updateAttendee = (index, changes) => {
    setForm((current) => ({
      ...current,
      attendees: current.attendees.map((attendee, currentIndex) =>
        currentIndex === index ? { ...attendee, ...changes } : attendee,
      ),
    }));
  };
  const removeAttendee = (index) => {
    setForm((current) => ({
      ...current,
      attendees: current.attendees.filter((item, currentIndex) => currentIndex !== index),
    }));
  };
  const addAttendee = () => {
    setForm((current) => ({
      ...current,
      attendees: [...current.attendees, blankTrainingAttendee()],
    }));
  };

  return (
    <div className="training-attendee-editor">
      {attendees.map((attendee, index) => (
        <div className="training-attendee-row" key={index}>
          <Field label="Attendee">
            <select
              value={attendee.personnelProfileId}
              onChange={(event) =>
                updateAttendee(index, { personnelProfileId: event.target.value })
              }
            >
              <option value="">Choose one</option>
              {personnel.map((profile) => {
                const selectedElsewhere =
                  selectedPersonnelIds.has(profile.id) &&
                  profile.id !== attendee.personnelProfileId;
                return (
                  <option disabled={selectedElsewhere} key={profile.id} value={profile.id}>
                    {personnelOptionLabel(profile)}
                  </option>
                );
              })}
            </select>
          </Field>
          <div className="training-outcome-controls" aria-label="Training outcome">
            <label className="checkbox-choice">
              <input
                checked={attendee.outcome === "Pass"}
                type="checkbox"
                onChange={(event) =>
                  updateAttendee(index, { outcome: event.target.checked ? "Pass" : "" })
                }
              />
              <span>Pass</span>
            </label>
            <label className="checkbox-choice">
              <input
                checked={attendee.outcome === "Fail"}
                type="checkbox"
                onChange={(event) =>
                  updateAttendee(index, { outcome: event.target.checked ? "Fail" : "" })
                }
              />
              <span>Fail</span>
            </label>
          </div>
          <Field label="Attendee Notes">
            <textarea
              value={attendee.notes}
              onChange={(event) => updateAttendee(index, { notes: event.target.value })}
            />
          </Field>
          <button
            className="secondary-action compact-action"
            disabled={attendees.length === 1}
            type="button"
            onClick={() => removeAttendee(index)}
          >
            Remove
          </button>
        </div>
      ))}
      <button className="secondary-action" type="button" onClick={addAttendee}>
        Add attendee
      </button>
    </div>
  );
}

function TrainingSessionList({ items, onEdit }) {
  if (!items.length) {
    return (
      <EmptyState
        title="No recorded sessions"
        detail="No training sessions have been recorded yet."
      />
    );
  }

  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Course</th>
            <th>Completion Date</th>
            <th>Attendees</th>
            <th>Recorded By</th>
            <th>
              <span className="visually-hidden">Edit session</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.id}>
              <td>{trainingCourseDisplayLabel(item.course)}</td>
              <td>{formatDate(item.completedAt)}</td>
              <td>
                {item.summary?.total ?? 0} total / {item.summary?.passed ?? 0} pass /{" "}
                {item.summary?.failed ?? 0} fail
              </td>
              <td>
                {accountDisplayName(item.instructorAccount ?? item.recordedByAccount, "Unknown")}
              </td>
              <td className="application-open-cell">
                <button
                  className="secondary-action compact-action"
                  disabled={!item.permissions?.canEdit}
                  type="button"
                  onClick={() => onEdit(item.id)}
                >
                  EDIT
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ApplicationsWorkspace({
  applicationId = null,
  mode = "applications",
  session,
  onNavigate,
}) {
  if (applicationId) {
    if (mode === "records") {
      return (
        <ApplicationRecordDetailWorkspace
          applicationId={applicationId}
          session={session}
          onNavigate={onNavigate}
        />
      );
    }
    return (
      <ApplicationDetailWorkspace
        applicationId={applicationId}
        session={session}
        onNavigate={onNavigate}
      />
    );
  }

  if (mode === "records") {
    return <ApplicationRecordsListWorkspace session={session} onNavigate={onNavigate} />;
  }

  return <ApplicationListWorkspace session={session} onNavigate={onNavigate} />;
}

function StaffApplicantReviewWorkspace({ applicationId = null, onNavigate }) {
  if (applicationId) {
    return (
      <StaffApplicationDetailWorkspace applicationId={applicationId} onNavigate={onNavigate} />
    );
  }

  return <StaffApplicationListWorkspace onNavigate={onNavigate} />;
}

function StaffUnitWorkspace() {
  const [overview, setOverview] = useState({
    status: "loading",
    data: null,
    error: null,
  });
  const [selectedUnitId, setSelectedUnitId] = useState("");
  const [editingMosId, setEditingMosId] = useState("");
  const [slotDraft, setSlotDraft] = useState("");
  const [message, setMessage] = useState("");

  const loadOverview = async (unitId = selectedUnitId) => {
    setOverview({ status: "loading", data: null, error: null });
    const search = unitId ? `?unitId=${encodeURIComponent(unitId)}` : "";
    const result = await fetchJson(`/units/staff-overview${search}`);
    if (!result.ok) {
      setOverview({
        status: "error",
        data: null,
        error: result.payload?.error?.message ?? "Unable to load the unit overview.",
      });
      return;
    }

    const data = result.payload.data ?? null;
    setSelectedUnitId(data?.selectedUnit?.id ?? "");
    setOverview({ status: "ready", data, error: null });
  };

  useEffect(() => {
    loadOverview();
  }, []);

  const saveSlots = async (mosId) => {
    const unitId = overview.data?.selectedUnit?.id;
    if (!unitId) {
      setMessage("Select a unit before updating slots.");
      return;
    }

    setMessage("Saving unit slots...");
    const result = await fetchJson(`/units/${unitId}/mos/${mosId}/slots`, {
      method: "PATCH",
      body: { authorizedSlots: slotDraft },
    });
    if (!result.ok) {
      setMessage(result.payload?.error?.message ?? "Unable to save unit slots.");
      return;
    }

    setEditingMosId("");
    setSlotDraft("");
    setMessage("Unit slots updated.");
    await loadOverview(unitId);
  };

  return (
    <div className="application-page">
      {message ? (
        <section className="wide-panel notice-panel">
          <strong>{message}</strong>
        </section>
      ) : null}
      <section className="wide-panel application-panel">
        {overview.status === "loading" ? <SkeletonRows /> : null}
        {overview.status === "error" ? (
          <EmptyState title="Unit overview unavailable" detail={overview.error} />
        ) : null}
        {overview.status === "ready" ? (
          <div className="detail-stack application-review-stack">
            <ApplicationReviewSection title="UNIT ROSTER">
              {(overview.data?.roots ?? []).length > 1 ? (
                <Field label="Unit">
                  <select
                    value={selectedUnitId}
                    onChange={(event) => {
                      const nextUnitId = event.target.value;
                      setSelectedUnitId(nextUnitId);
                      loadOverview(nextUnitId);
                    }}
                  >
                    {(overview.data?.roots ?? []).map((unit) => (
                      <option key={unit.id} value={unit.id}>
                        {unit.name}
                      </option>
                    ))}
                  </select>
                </Field>
              ) : null}
              <UnitRosterTree groups={overview.data?.rosterGroups ?? []} />
            </ApplicationReviewSection>
            <ApplicationReviewSection title="UNIT STRENGTH">
              <UnitStrengthTable
                canEdit={Boolean(overview.data?.permissions?.canEdit)}
                editingMosId={editingMosId}
                rows={overview.data?.strengthRows ?? []}
                slotDraft={slotDraft}
                onCancel={() => {
                  setEditingMosId("");
                  setSlotDraft("");
                }}
                onEdit={(row) => {
                  setEditingMosId(row.id);
                  setSlotDraft(String(row.authorizedSlots ?? 0));
                }}
                onSave={saveSlots}
                onSlotDraftChange={setSlotDraft}
              />
            </ApplicationReviewSection>
          </div>
        ) : null}
      </section>
    </div>
  );
}

function StaffApplicationListWorkspace({ onNavigate }) {
  const [queue, setQueue] = useState({ status: "loading", items: [], error: null });

  const loadQueue = async () => {
    setQueue({ status: "loading", items: [], error: null });
    const result = await fetchJson("/applications/unit-review");
    if (!result.ok) {
      setQueue({
        status: "error",
        items: [],
        error: result.payload?.error?.message ?? "Unable to load applicants.",
      });
      return;
    }
    setQueue({ status: "ready", items: result.payload.items ?? [], error: null });
  };

  useEffect(() => {
    loadQueue();
  }, []);

  return (
    <div className="application-page">
      <section className="wide-panel application-panel">
        <PanelHeader title="Applicant Review" />
        <ApplicationList
          items={queue.items}
          loading={queue.status === "loading"}
          error={queue.error}
          onOpen={(id) => onNavigate(`/staff/applicant-review/${encodeURIComponent(id)}`)}
        />
      </section>
    </div>
  );
}

function StaffApplicationDetailWorkspace({ applicationId, onNavigate }) {
  const [detail, setDetail] = useState({ status: "loading", application: null, error: null });
  const [actionState, setActionState] = useState({ reason: "", noteBody: "" });
  const [message, setMessage] = useState("");

  const loadDetail = async (applicationId) => {
    if (!applicationId) {
      setDetail({ status: "error", application: null, error: "Application ID is required." });
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
  };

  useEffect(() => {
    loadDetail(applicationId);
  }, [applicationId]);

  const runAction = async (actionName, path, requirements = {}) => {
    const reason = actionState.reason.trim();
    if (requirements.reason && !reason) {
      setMessage(`Action reason is required for ${actionName}.`);
      return;
    }

    setMessage(`${actionName}...`);
    const result = await fetchJson(path, {
      method: "POST",
      body: { reason },
    });
    if (!result.ok) {
      setMessage(result.payload?.error?.message ?? `${actionName} failed.`);
      return;
    }
    setMessage(`${actionName} complete.`);
    await loadDetail(applicationId);
  };

  const saveNote = async () => {
    const noteBody = actionState.noteBody.trim();
    if (!noteBody) {
      setMessage("Staff note is required.");
      return;
    }

    setMessage("Saving note...");
    const result = await fetchJson(`/applications/${applicationId}/unit-notes`, {
      method: "POST",
      body: { noteBody },
    });
    if (!result.ok) {
      setMessage(result.payload?.error?.message ?? "Save note failed.");
      return;
    }

    setActionState((current) => ({ ...current, noteBody: "" }));
    setMessage("Note saved.");
    await loadDetail(applicationId);
  };

  return (
    <div className="application-page">
      {message ? (
        <section className="wide-panel notice-panel">
          <strong>{message}</strong>
        </section>
      ) : null}
      <section className="wide-panel application-panel">
        <div className="application-detail-toolbar">
          <button
            className="secondary-action"
            type="button"
            onClick={() => onNavigate("/staff/applicant-review")}
          >
            Back to applicants
          </button>
        </div>
        <StaffApplicationDetail
          actionState={actionState}
          application={detail.application}
          detail={detail}
          onAction={runAction}
          onSaveNote={saveNote}
          setActionState={setActionState}
        />
      </section>
    </div>
  );
}

function ApplicationListWorkspace({ session, onNavigate }) {
  const [queue, setQueue] = useState({ status: "loading", items: [], error: null });
  const [message, setMessage] = useState("");
  const currentAccountId = session?.summary?.account?.id ?? "";

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

  const claimApplication = async (applicationId) => {
    setMessage("Claiming application...");
    const result = await fetchJson(`/applications/${applicationId}/claim`, {
      method: "POST",
      body: {},
    });
    if (!result.ok) {
      setMessage(result.payload?.error?.message ?? "Claim application failed.");
      return;
    }

    setMessage("Application claimed.");
    await loadQueue();
  };

  useEffect(() => {
    loadQueue();
  }, []);

  return (
    <div className="application-page">
      {message ? (
        <section className="wide-panel notice-panel">
          <strong>{message}</strong>
        </section>
      ) : null}
      <section className="wide-panel application-panel">
        <PanelHeader title="Applications" />
        <ApplicationList
          currentAccountId={currentAccountId}
          items={queue.items}
          loading={queue.status === "loading"}
          error={queue.error}
          onClaim={claimApplication}
          onOpen={(id) => onNavigate(`/recruiting/applications/${encodeURIComponent(id)}`)}
          showClaimColumn
        />
      </section>
    </div>
  );
}

function ApplicationRecordsListWorkspace({ session, onNavigate }) {
  const [records, setRecords] = useState({ status: "loading", items: [], error: null });
  const [message, setMessage] = useState("");

  const loadRecords = async () => {
    setRecords({ status: "loading", items: [], error: null });
    const result = await fetchJson("/applications/review-records");
    if (!result.ok) {
      setRecords({
        status: "error",
        items: [],
        error: result.payload?.error?.message ?? "Unable to load application records.",
      });
      return;
    }
    setRecords({ status: "ready", items: result.payload.items ?? [], error: null });
  };

  useEffect(() => {
    loadRecords();
  }, []);

  const reopenRecord = async (applicationId) => {
    setMessage("Reopening application...");
    const result = await fetchJson(`/applications/${applicationId}/reopen`, {
      method: "POST",
      body: {},
    });
    if (!result.ok) {
      setMessage(result.payload?.error?.message ?? "Reopen failed.");
      return;
    }

    setMessage("Application reopened.");
    await loadRecords();
  };

  return (
    <div className="application-page">
      {message ? (
        <section className="wide-panel notice-panel">
          <strong>{message}</strong>
        </section>
      ) : null}
      <section className="wide-panel application-panel">
        <PanelHeader title="Records" />
        <ApplicationList
          items={records.items}
          loading={records.status === "loading"}
          error={records.error}
          emptyDetail="No closed application records are available."
          onOpen={(id) => onNavigate(`/recruiting/records/${encodeURIComponent(id)}`)}
          onReopen={reopenRecord}
          showReopenColumn
          showReopenForItem={(item) => canReopenRecruitingRecord(item, session)}
        />
      </section>
    </div>
  );
}

function ApplicationDetailWorkspace({ applicationId, session, onNavigate }) {
  const [detail, setDetail] = useState({ status: "loading", application: null, error: null });
  const [options, setOptions] = useState({ units: [] });
  const [actionState, setActionState] = useState({ reason: "", noteBody: "", targetUnitId: "" });
  const [message, setMessage] = useState("");
  const currentAccountId = session?.summary?.account?.id ?? "";

  const loadDetail = async (applicationId) => {
    if (!applicationId) {
      setDetail({ status: "error", application: null, error: "Application ID is required." });
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
    loadDetail(applicationId);
    fetchJson("/applications/recruiting-options").then((result) => {
      if (result.ok) {
        setOptions(result.payload.data ?? { units: [] });
      }
    });
  }, [applicationId]);

  const runAction = async (actionName, path, extraBody = {}, requirements = {}) => {
    if (
      requirements.claimedByCurrentUser &&
      !isClaimedByCurrentUser(detail.application, currentAccountId)
    ) {
      setMessage("Claim this application before making recruiter changes.");
      return;
    }

    const reason = actionState.reason.trim();
    if (requirements.reason && !reason) {
      setMessage(`Action reason is required for ${actionName}.`);
      return;
    }
    if (requirements.targetUnit && !actionState.targetUnitId) {
      setMessage("Select a target unit before recommending the applicant.");
      return;
    }

    setMessage(`${actionName}...`);
    const result = await fetchJson(path, {
      method: "POST",
      body: {
        reason,
        ...extraBody,
      },
    });
    if (!result.ok) {
      setMessage(result.payload?.error?.message ?? `${actionName} failed.`);
      return;
    }
    setMessage(`${actionName} complete.`);
    await loadDetail(applicationId);
  };

  const saveNote = async () => {
    if (!isClaimedByCurrentUser(detail.application, currentAccountId)) {
      setMessage("Claim this application before saving recruiting notes.");
      return;
    }

    const noteBody = actionState.noteBody.trim();
    if (!noteBody) {
      setMessage("Recruiting note is required.");
      return;
    }

    setMessage("Saving note...");
    const result = await fetchJson(`/applications/${applicationId}/notes`, {
      method: "POST",
      body: { noteBody },
    });
    if (!result.ok) {
      setMessage(result.payload?.error?.message ?? "Save note failed.");
      return;
    }

    setActionState((current) => ({ ...current, noteBody: "" }));
    setMessage("Note saved.");
    await loadDetail(applicationId);
  };

  const releaseClaim = async () => {
    setMessage("Releasing application...");
    const result = await fetchJson(`/applications/${applicationId}/release-claim`, {
      method: "POST",
      body: {},
    });
    if (!result.ok) {
      setMessage(result.payload?.error?.message ?? "Release application failed.");
      return;
    }

    setMessage("Application released.");
    await loadDetail(applicationId);
  };

  return (
    <div className="application-page">
      {message ? (
        <section className="wide-panel notice-panel">
          <strong>{message}</strong>
        </section>
      ) : null}
      <section className="wide-panel application-panel">
        <div className="application-detail-toolbar">
          <button
            className="secondary-action"
            type="button"
            onClick={() => onNavigate("/recruiting/applications")}
          >
            Back to applications
          </button>
        </div>
        <ReviewerApplicationDetail
          actionState={actionState}
          application={detail.application}
          currentAccountId={currentAccountId}
          detail={detail}
          onAction={runAction}
          onReleaseClaim={releaseClaim}
          onSaveNote={saveNote}
          options={options}
          setActionState={setActionState}
        />
      </section>
    </div>
  );
}

function ApplicationRecordDetailWorkspace({ applicationId, session, onNavigate }) {
  const [detail, setDetail] = useState({ status: "loading", application: null, error: null });
  const [message, setMessage] = useState("");

  const loadDetail = async (nextApplicationId) => {
    if (!nextApplicationId) {
      setDetail({ status: "error", application: null, error: "Application ID is required." });
      return;
    }

    setDetail({ status: "loading", application: null, error: null });
    const result = await fetchJson(`/applications/${nextApplicationId}`);
    if (!result.ok) {
      setDetail({
        status: "error",
        application: null,
        error: result.payload?.error?.message ?? "Unable to load application record.",
      });
      return;
    }

    setDetail({ status: "ready", application: result.payload.data, error: null });
  };

  useEffect(() => {
    loadDetail(applicationId);
  }, [applicationId]);

  const reopenRecord = async () => {
    setMessage("Reopening application...");
    const result = await fetchJson(`/applications/${applicationId}/reopen`, {
      method: "POST",
      body: {},
    });
    if (!result.ok) {
      setMessage(result.payload?.error?.message ?? "Reopen failed.");
      return;
    }

    setMessage("Application reopened.");
    onNavigate(`/recruiting/applications/${encodeURIComponent(applicationId)}`);
  };

  return (
    <div className="application-page">
      {message ? (
        <section className="wide-panel notice-panel">
          <strong>{message}</strong>
        </section>
      ) : null}
      <section className="wide-panel application-panel">
        <div className="application-detail-toolbar">
          <button
            className="secondary-action"
            type="button"
            onClick={() => onNavigate("/recruiting/records")}
          >
            Back to records
          </button>
          {canReopenRecruitingRecord(detail.application, session) ? (
            <button className="secondary-action" type="button" onClick={reopenRecord}>
              REOPEN
            </button>
          ) : null}
        </div>
        <RecruiterApplicationRecordDetail application={detail.application} detail={detail} />
      </section>
    </div>
  );
}

function ContractPlaceholder({ match }) {
  const showDashboardStats = isSectionDashboardMatch(match);

  return (
    <div className="workspace-grid">
      {showDashboardStats ? (
        <>
          <MetricPanel label="Section" value={match.section.label} />
          <MetricPanel label="Page" value={match.node.label} />
        </>
      ) : null}
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

function ResourceContent({ onOpenPersonnel = null, resource, type }) {
  if (resource.status === "loading") {
    return <SkeletonRows />;
  }

  if (resource.status === "error") {
    return <EmptyState title="Access unavailable" detail={resource.error} />;
  }

  if (type === "personnel-list") {
    const items = resource.data?.items ?? [];
    return <RosterTable items={items} onOpen={onOpenPersonnel} />;
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

function RosterTable({ items, onOpen }) {
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
            <th>
              <span className="visually-hidden">Open personnel profile</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.id}>
              <td>{personDisplayName({ fullName: item.name }, "Unnamed member")}</td>
              <td>{personnelStatusLabel(item.status)}</td>
              <td>{unitDisplayLabel(item.currentUnit)}</td>
              <td>{rankDisplayLabel(item.currentRank, { compact: true })}</td>
              <td>{formatRosterMos(item)}</td>
              <td className="application-open-cell">
                <button
                  className="secondary-action compact-action"
                  disabled={!onOpen}
                  type="button"
                  onClick={() => onOpen?.(item.id)}
                >
                  OPEN
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function formatRosterMos(item) {
  const primary = item.currentMOS ? mosDisplayLabel(item.currentMOS) : "";
  const secondary = item.currentSecondaryMOS ? mosDisplayLabel(item.currentSecondaryMOS) : "";
  return [primary, secondary].filter(Boolean).join(" / ") || "-";
}

function ApplicationList({
  currentAccountId = "",
  items,
  loading = false,
  error = null,
  emptyDetail = "The review queue is empty.",
  onClaim = null,
  onReopen = null,
  onOpen = null,
  showClaimColumn = false,
  showReopenColumn = false,
  showReopenForItem = () => true,
}) {
  if (loading) {
    return <SkeletonRows />;
  }

  if (error) {
    return <EmptyState title="Applications unavailable" detail={error} />;
  }

  if (!items.length) {
    return <EmptyState title="No applications" detail={emptyDetail} />;
  }

  return (
    <div className="table-wrap">
      <table className="application-list-table">
        <thead>
          <tr>
            <th>Name</th>
            <th>Submitted date</th>
            <th>Status</th>
            {showClaimColumn ? (
              <th>
                <span className="visually-hidden">Claim application</span>
              </th>
            ) : null}
            {showReopenColumn ? (
              <th>
                <span className="visually-hidden">Reopen application</span>
              </th>
            ) : null}
            <th>
              <span className="visually-hidden">Open application</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {items.map((item) => (
            <tr key={item.id}>
              <td>{applicationDisplayName(item)}</td>
              <td>{formatDate(item.submittedAt)}</td>
              <td>
                <span className="status-pill">{applicationStatusLabel(item.status)}</span>
              </td>
              {showClaimColumn ? (
                <td className="application-open-cell">
                  {item.claimedByAccountId ? (
                    <button
                      className="secondary-action compact-action"
                      disabled
                      title={claimButtonTitle(item, currentAccountId)}
                      type="button"
                    >
                      CLAIMED
                    </button>
                  ) : (
                    <button
                      className="secondary-action compact-action"
                      disabled={!onClaim}
                      type="button"
                      onClick={() => onClaim?.(item.id)}
                    >
                      CLAIM
                    </button>
                  )}
                </td>
              ) : null}
              {showReopenColumn ? (
                <td className="application-open-cell">
                  <button
                    className="secondary-action compact-action"
                    disabled={!onReopen || !showReopenForItem(item)}
                    type="button"
                    onClick={() => onReopen?.(item.id)}
                  >
                    REOPEN
                  </button>
                </td>
              ) : null}
              <td className="application-open-cell">
                <button
                  className="secondary-action compact-action"
                  disabled={!onOpen}
                  type="button"
                  onClick={() => onOpen?.(item.id)}
                >
                  OPEN
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function UnitRosterTree({ groups }) {
  if (!groups.length) {
    return (
      <EmptyState
        title="No personnel found"
        detail="No personnel are assigned inside this unit tree."
      />
    );
  }

  return (
    <div className="unit-roster-tree">
      {groups.map((group) => (
        <section className="unit-roster-group" key={group.unit.id}>
          <div className="unit-roster-heading">
            <strong>{group.unit.name}</strong>
          </div>
          <div className="table-wrap">
            <table className="unit-roster-table">
              <colgroup>
                <col className="unit-roster-col-name" />
                <col className="unit-roster-col-status" />
                <col className="unit-roster-col-rank" />
                <col className="unit-roster-col-assignment" />
                <col className="unit-roster-col-team" />
                <col className="unit-roster-col-mos" />
              </colgroup>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Status</th>
                  <th>Rank</th>
                  <th>Assignment</th>
                  <th>Team</th>
                  <th>Primary MOS</th>
                </tr>
              </thead>
              <tbody>
                {group.members.map((member) => (
                  <tr key={member.id}>
                    <td>{personDisplayName({ fullName: member.name }, "Unnamed member")}</td>
                    <td>{personnelStatusLabel(member.status)}</td>
                    <td>{rankDisplayLabel(member.currentRank, { compact: true })}</td>
                    <td>{billetDisplayLabel(member.currentBillet, { empty: "Unassigned" })}</td>
                    <td>{member.teamLabel || "-"}</td>
                    <td>{mosDisplayLabel(member.currentMOS, { empty: "Unassigned" })}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ))}
    </div>
  );
}

function UnitStrengthTable({
  canEdit,
  editingMosId,
  rows,
  slotDraft,
  onCancel,
  onEdit,
  onSave,
  onSlotDraftChange,
}) {
  if (!rows.length) {
    return <EmptyState title="No MOS rows" detail="No MOS rows are configured for this unit." />;
  }

  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>MOS</th>
            <th>Assigned</th>
            <th>Slots</th>
            <th>
              <span className="visually-hidden">Edit unit slots</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const editing = editingMosId === row.id;
            return (
              <tr key={row.id}>
                <td>{mosDisplayLabel(row)}</td>
                <td>{row.assigned ?? 0}</td>
                <td>
                  {editing ? (
                    <input
                      className="unit-slots-input"
                      min="0"
                      step="1"
                      type="number"
                      value={slotDraft}
                      onChange={(event) => onSlotDraftChange(event.target.value)}
                    />
                  ) : (
                    (row.authorizedSlots ?? 0)
                  )}
                </td>
                <td className="application-open-cell">
                  {editing ? (
                    <div className="unit-slot-actions">
                      <button
                        className="secondary-action compact-action"
                        type="button"
                        onClick={() => onSave(row.id)}
                      >
                        SAVE
                      </button>
                      <button
                        className="secondary-action compact-action"
                        type="button"
                        onClick={onCancel}
                      >
                        CANCEL
                      </button>
                    </div>
                  ) : (
                    <button
                      className="secondary-action compact-action"
                      disabled={!canEdit}
                      type="button"
                      onClick={() => onEdit(row)}
                    >
                      EDIT
                    </button>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function ApplicationForm({ form, options, setForm }) {
  const selectedUnits = new Set(form.interestedUnitIds);
  const mosOptions = selectedUnits.size
    ? (options.mos ?? []).filter((mos) => selectedUnits.has(mos.unitId))
    : [];
  const timeZones = options.timeZones ?? [];
  const availabilitySlots = options.availabilitySlots ?? [];

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
  const toggleAvailabilitySlot = (slotKey, checked) =>
    setForm((current) => ({
      ...current,
      availabilitySlotKeys: checked
        ? Array.from(new Set([...current.availabilitySlotKeys, slotKey]))
        : current.availabilitySlotKeys.filter((key) => key !== slotKey),
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
  const updateArmaPresent = (index, value) =>
    setForm((current) => ({
      ...current,
      armaUnits: current.armaUnits.map((unit, itemIndex) =>
        itemIndex === index
          ? {
              ...unit,
              stillMember: value,
              leftAt: value ? "" : unit.leftAt,
              reasonLeft: value ? "" : unit.reasonLeft,
            }
          : unit,
      ),
    }));

  return (
    <div className="application-form">
      <ApplicationReviewSection title="DETAILS">
        <div className="application-section-row">
          <Field label="FIRST NAME">
            <input
              aria-label="First name"
              placeholder="FIRST NAME"
              value={form.firstName}
              onChange={(event) => update("firstName", event.target.value)}
            />
          </Field>
          <Field label="LAST NAME">
            <input
              aria-label="Last name"
              placeholder="LAST NAME"
              value={form.lastName}
              onChange={(event) => update("lastName", event.target.value)}
            />
          </Field>
        </div>
        <div className="application-section-row">
          <Field label="HOW OLD ARE YOU?">
            <input
              min="1"
              type="number"
              value={form.age}
              onChange={(event) => update("age", event.target.value)}
            />
          </Field>
          <Field label="WHAT TIME ZONE ARE YOU IN?">
            <select
              value={form.timeZone}
              onChange={(event) => update("timeZone", event.target.value)}
            >
              <option value="">CHOOSE ONE</option>
              {timeZones.map((timeZone) => (
                <option key={timeZone} value={timeZone}>
                  {timeZone}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <div className="application-section-row single">
          <Field label="WHY DO YOU WANT TO JOIN TASK FORCE 20?">
            <textarea
              value={form.reasonForJoining}
              onChange={(event) => update("reasonForJoining", event.target.value)}
            />
          </Field>
        </div>
      </ApplicationReviewSection>

      <ApplicationReviewSection title="BACKGROUND">
        <div className="application-section-line">
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
        </div>

        <div className="application-section-line">
          <BooleanLine
            checked={form.priorArma}
            label="ARE YOU CURRENTLY OR HAVE YOU EVER BEEN IN ANOTHER ARMA UNIT BEFORE JOINING TASK FORCE 20?"
            onChange={togglePriorArma}
          />
          {form.priorArma ? (
            <div className="conditional-detail">
              <div className="repeatable-stack">
                {form.armaUnits.map((unit, index) => (
                  <div className="arma-record" key={index}>
                    <div className="arma-record-row">
                      <Field label="UNIT NAME">
                        <input
                          value={unit.unitName}
                          onChange={(event) =>
                            updateArmaUnit(index, "unitName", event.target.value)
                          }
                        />
                      </Field>
                      <Field label="FROM">
                        <input
                          aria-label="From month"
                          type="month"
                          value={unit.joinedAt}
                          onChange={(event) =>
                            updateArmaUnit(index, "joinedAt", event.target.value)
                          }
                        />
                      </Field>
                      {!unit.stillMember ? (
                        <Field label="TO">
                          <input
                            aria-label="To month"
                            type="month"
                            value={unit.leftAt}
                            onChange={(event) =>
                              updateArmaUnit(index, "leftAt", event.target.value)
                            }
                          />
                        </Field>
                      ) : null}
                      <label className="checkbox-label">
                        <input
                          checked={unit.stillMember}
                          type="checkbox"
                          onChange={(event) => updateArmaPresent(index, event.target.checked)}
                        />
                        Present
                      </label>
                      <button
                        className="secondary-action"
                        type="button"
                        onClick={() =>
                          setForm((current) => ({
                            ...current,
                            armaUnits: current.armaUnits.filter(
                              (_, itemIndex) => itemIndex !== index,
                            ),
                          }))
                        }
                      >
                        Remove
                      </button>
                    </div>
                    {!unit.stillMember ? (
                      <Field label="WHY DID YOU LEAVE?">
                        <textarea
                          className="arma-reason-textarea"
                          value={unit.reasonLeft}
                          onChange={(event) =>
                            updateArmaUnit(index, "reasonLeft", event.target.value)
                          }
                        />
                      </Field>
                    ) : null}
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
        </div>

        <div className="application-section-line">
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
        </div>
      </ApplicationReviewSection>

      <ApplicationReviewSection title="SELECTIONS">
        <div className="application-section-row single">
          <ChoiceList
            emptyMessage="No units with current MOS openings are available."
            getLabel={(unit) => unit.name}
            getNote={(unit, isSelected) =>
              unit.isStale
                ? isSelected
                  ? "No current opening. Remove this selection before submitting."
                  : "No current opening."
                : ""
            }
            isOptionDisabled={(unit, isSelected) => unit.isStale && !isSelected}
            items={options.units ?? []}
            label="INTERESTED UNIT"
            selectedIds={form.interestedUnitIds}
            onToggle={toggleInterestedUnit}
          />
        </div>
        <div className="application-section-row single">
          <ChoiceList
            emptyMessage={
              selectedUnits.size
                ? "No MOS choices with current openings are available for the selected unit."
                : "Select an interested unit first."
            }
            getLabel={(mos) => mosDisplayLabel(mos)}
            getNote={(mos, isSelected) =>
              mos.isStale
                ? isSelected
                  ? "No current opening. Remove this selection before submitting."
                  : "No current opening."
                : ""
            }
            isOptionDisabled={(mos, isSelected) => mos.isStale && !isSelected}
            items={mosOptions}
            label="INTERESTED MOS"
            selectedIds={form.desiredMOSIds}
            onToggle={toggleDesiredMOS}
          />
        </div>
      </ApplicationReviewSection>

      <ApplicationReviewSection title="AVAILABILITY">
        <p className="application-section-copy">{APPLICATION_AVAILABILITY_COPY}</p>
        <div className="application-section-row single">
          <ChoiceList
            emptyMessage="No availability time slots are configured."
            getLabel={(slot) => slot.label}
            items={availabilitySlots}
            label="AVAILABLE TIME SLOTS"
            selectedIds={form.availabilitySlotKeys}
            onToggle={toggleAvailabilitySlot}
          />
        </div>
      </ApplicationReviewSection>

      <ApplicationReviewSection title="SOURCE">
        <div className="application-section-row single">
          <Field label="HOW DID YOU HEAR ABOUT US?">
            <select value={form.source} onChange={(event) => update("source", event.target.value)}>
              <option value="">CHOOSE ONE</option>
              {(options.sources ?? []).map((source) => (
                <option key={source} value={source}>
                  {humanize(source)}
                </option>
              ))}
            </select>
          </Field>
        </div>
      </ApplicationReviewSection>
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

function ChoiceList({
  emptyMessage,
  getLabel,
  getNote,
  isOptionDisabled,
  items,
  label,
  onToggle,
  selectedIds,
}) {
  const selected = new Set(selectedIds ?? []);
  return (
    <section className="choice-section">
      <span className="choice-heading">{label}</span>
      {items.length ? (
        <div className="choice-list">
          {items.map((item) => {
            const isSelected = selected.has(item.id);
            const note = getNote ? getNote(item, isSelected) : "";
            const isDisabled = isOptionDisabled ? isOptionDisabled(item, isSelected) : false;
            return (
              <label
                className={`choice-option${isSelected ? " selected" : ""}${isDisabled ? " disabled" : ""}${item.isStale ? " stale" : ""}`}
                key={item.id}
              >
                <input
                  checked={isSelected}
                  disabled={isDisabled}
                  type="checkbox"
                  onChange={(event) => onToggle(item.id, event.target.checked)}
                />
                <span className="choice-copy">
                  <span>{getLabel(item)}</span>
                  {note ? <small>{note}</small> : null}
                </span>
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

function IntakeDocumentsGate({
  checkedDocumentKeys,
  documents,
  onAgree,
  onCheck,
  onOpen,
  openedDocumentKeys,
}) {
  const openedKeys = new Set(openedDocumentKeys);
  const checkedKeys = new Set(checkedDocumentKeys);
  const allChecked =
    documents.length > 0 && documents.every((document) => checkedKeys.has(document.key));

  const markOpened = (documentKey) => {
    onOpen((current) => Array.from(new Set([...current, documentKey])));
  };

  const setChecked = (documentKey, checked) => {
    onCheck((current) => {
      const next = new Set(current);
      if (checked) {
        next.add(documentKey);
      } else {
        next.delete(documentKey);
      }
      return [...next];
    });
  };

  return (
    <ApplicationReviewSection title="INTAKE DOCUMENTS">
      <p className="muted-copy">
        Review each intake document before continuing your enlistment application.
      </p>
      {documents.length ? (
        <div className="intake-document-list">
          {documents.map((document) => {
            const opened = openedKeys.has(document.key);
            const agreed = document.status === "agreed";
            const checked = checkedKeys.has(document.key);
            return (
              <div className="intake-document-row" key={document.key}>
                <div>
                  <strong>{document.title}</strong>
                  <span>{intakeAgreementStatusLabel(document.status)}</span>
                </div>
                <a
                  className="secondary-action button-like"
                  href={document.pdfUrl}
                  onClick={() => markOpened(document.key)}
                  rel="noreferrer"
                  target="_blank"
                >
                  Open PDF
                </a>
                <label className="checkbox-label">
                  <input
                    checked={checked}
                    disabled={!opened && !agreed}
                    type="checkbox"
                    onChange={(event) => setChecked(document.key, event.target.checked)}
                  />
                  I agree
                </label>
              </div>
            );
          })}
        </div>
      ) : (
        <EmptyState
          title="Documents unavailable"
          detail="The intake document manifest could not be loaded."
        />
      )}
      <div className="button-row">
        <button
          className="primary-action button-like"
          disabled={!allChecked}
          type="button"
          onClick={onAgree}
        >
          Continue to application
        </button>
      </div>
    </ApplicationReviewSection>
  );
}

function IntakeAgreementsSummary({ application }) {
  const documents = application?.intakeDocuments ?? [];
  if (!documents.length) {
    return (
      <EmptyState
        title="No intake document status"
        detail="No intake document agreement records are available for this application."
      />
    );
  }

  return (
    <div className="intake-agreement-list">
      {documents.map((document) => (
        <div className="readonly-field" key={document.key}>
          <span>{document.title}</span>
          <strong>{intakeAgreementStatusLabel(document.status)}</strong>
          <small>
            {document.agreement?.agreedAt
              ? `Agreed ${formatDate(document.agreement.agreedAt)}`
              : "No current agreement recorded."}
          </small>
          <small>Version {document.documentHashShort}</small>
        </div>
      ))}
    </div>
  );
}

function StaffApplicationDetail({
  actionState,
  application,
  detail,
  onAction,
  onSaveNote,
  setActionState,
}) {
  if (detail.status === "idle") {
    return (
      <EmptyState title="No application selected" detail="Choose an applicant from the queue." />
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
  const reviewable = ["RecruiterRecommended", "TargetUnitReview"].includes(application.status);

  return (
    <div className="detail-stack application-review-stack">
      <ApplicationReviewSection title="APPLICATION STATUS">
        <ApplicationStatusSummary application={application} showTargetUnit={false} />
      </ApplicationReviewSection>
      <ApplicationReviewSection title="APPLICATION DETAILS">
        <ReadOnlyApplication application={application} reviewMode />
      </ApplicationReviewSection>
      <ApplicationReviewSection title="INTAKE AGREEMENTS">
        <IntakeAgreementsSummary application={application} />
      </ApplicationReviewSection>
      <ApplicationReviewSection title="UNIT REVIEW">
        <div className="application-review-actions">
          {!reviewable ? (
            <p className="muted-copy">This application is not currently awaiting unit review.</p>
          ) : null}
          <div className="button-row">
            <button
              className="secondary-action"
              disabled={!reviewable}
              type="button"
              onClick={() =>
                onAction("Request info", `/applications/${application.id}/unit-request-info`, {
                  reason: true,
                })
              }
            >
              Request info
            </button>
            <button
              className="primary-action button-like"
              disabled={!reviewable}
              type="button"
              onClick={() => onAction("Accept", `/applications/${application.id}/accept`)}
            >
              Accept
            </button>
            <button
              className="danger-action"
              disabled={!reviewable}
              type="button"
              onClick={() =>
                onAction("Reject", `/applications/${application.id}/reject`, { reason: true })
              }
            >
              Reject
            </button>
          </div>
          <Field label="Action reason">
            <textarea
              disabled={!reviewable}
              value={actionState.reason}
              onChange={(event) => updateAction("reason", event.target.value)}
            />
          </Field>
        </div>
      </ApplicationReviewSection>
      <ApplicationReviewSection title="STAFF NOTES">
        <div className="application-review-actions">
          <Field label="Notes">
            <textarea
              value={actionState.noteBody}
              onChange={(event) => updateAction("noteBody", event.target.value)}
            />
          </Field>
          <div className="button-row">
            <button className="secondary-action" type="button" onClick={onSaveNote}>
              Save note
            </button>
          </div>
          <ApplicationNotesHistory
            emptyDetail="No staff notes have been recorded yet."
            items={application.notes ?? []}
          />
        </div>
      </ApplicationReviewSection>
      <ApplicationReviewSection title="STATUS HISTORY">
        <Timeline items={application.statusHistory ?? []} showTitle={false} />
      </ApplicationReviewSection>
    </div>
  );
}

function RecruiterApplicationRecordDetail({ application, detail }) {
  if (detail.status === "idle") {
    return <EmptyState title="No application selected" detail="Choose a record from the list." />;
  }
  if (detail.status === "loading") {
    return <SkeletonRows />;
  }
  if (detail.status === "error") {
    return <EmptyState title="Record unavailable" detail={detail.error} />;
  }

  return (
    <div className="detail-stack application-review-stack">
      <ApplicationReviewSection title="APPLICATION STATUS">
        <ApplicationStatusSummary application={application} />
      </ApplicationReviewSection>
      <ApplicationReviewSection title="APPLICATION DETAILS">
        <ReadOnlyApplication application={application} reviewMode />
      </ApplicationReviewSection>
      <ApplicationReviewSection title="RECRUITING NOTES">
        <ApplicationNotesHistory items={application.notes ?? []} />
      </ApplicationReviewSection>
      <ApplicationReviewSection title="INTAKE AGREEMENTS">
        <IntakeAgreementsSummary application={application} />
      </ApplicationReviewSection>
      <ApplicationReviewSection title="STATUS HISTORY">
        <Timeline items={application.statusHistory ?? []} showTitle={false} />
      </ApplicationReviewSection>
    </div>
  );
}

function ReviewerApplicationDetail({
  actionState,
  application,
  currentAccountId,
  detail,
  onAction,
  onReleaseClaim,
  onSaveNote,
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
  const claimedByCurrentUser = isClaimedByCurrentUser(application, currentAccountId);
  const hasClaim = Boolean(application?.claimedByAccountId);
  const recruiterStage = ["Submitted", "RecruiterScreening", "MoreInfoRequested"].includes(
    application.status,
  );
  const claimStatusMessage = hasClaim
    ? claimedByCurrentUser
      ? "You have claimed this application and can make recruiter changes."
      : `Claimed by ${accountDisplayName(application.claimedByAccount)}. Recruiter controls are read-only.`
    : "Claim this application from the applications list before making recruiter changes.";

  return (
    <div className="detail-stack application-review-stack">
      <ApplicationReviewSection title="APPLICATION STATUS">
        <ApplicationStatusSummary application={application} />
      </ApplicationReviewSection>
      <ApplicationReviewSection title="APPLICATION DETAILS">
        <ReadOnlyApplication application={application} reviewMode />
      </ApplicationReviewSection>
      <ApplicationReviewSection title="RECRUITING NOTES">
        <div className="application-review-actions">
          <Field label="Notes">
            <textarea
              disabled={!claimedByCurrentUser}
              value={actionState.noteBody}
              onChange={(event) => updateAction("noteBody", event.target.value)}
            />
          </Field>
          <div className="button-row">
            <button
              className="secondary-action"
              disabled={!claimedByCurrentUser}
              type="button"
              onClick={onSaveNote}
            >
              Save note
            </button>
          </div>
          <ApplicationNotesHistory items={application.notes ?? []} />
        </div>
      </ApplicationReviewSection>
      <ApplicationReviewSection title="RECRUITING">
        <div className="application-review-actions">
          <p className="muted-copy">{claimStatusMessage}</p>
          <div className="button-row">
            <button
              className="secondary-action"
              disabled={!claimedByCurrentUser}
              type="button"
              onClick={() =>
                onAction(
                  "Request info",
                  `/applications/${application.id}/request-info`,
                  {},
                  { claimedByCurrentUser: true, reason: true },
                )
              }
            >
              Request info
            </button>
            <button
              className="secondary-action"
              disabled={!claimedByCurrentUser}
              type="button"
              onClick={() =>
                onAction(
                  "Recommend",
                  `/applications/${application.id}/recommend`,
                  {
                    targetUnitId: actionState.targetUnitId,
                  },
                  { claimedByCurrentUser: true, targetUnit: true },
                )
              }
            >
              Recommend
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
              disabled={recruiterStage && !claimedByCurrentUser}
              type="button"
              onClick={() =>
                onAction(
                  "Reject",
                  `/applications/${application.id}/reject`,
                  {},
                  {
                    claimedByCurrentUser: recruiterStage,
                    reason: true,
                  },
                )
              }
            >
              Reject
            </button>
            {claimedByCurrentUser ? (
              <button className="secondary-action" type="button" onClick={onReleaseClaim}>
                Release application
              </button>
            ) : null}
          </div>
          <Field label="Target unit">
            <select
              disabled={!claimedByCurrentUser}
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
          <Field label="Action reason">
            <textarea
              disabled={!claimedByCurrentUser}
              value={actionState.reason}
              onChange={(event) => updateAction("reason", event.target.value)}
            />
          </Field>
        </div>
      </ApplicationReviewSection>
      <ApplicationReviewSection title="INTAKE AGREEMENTS">
        <IntakeAgreementsSummary application={application} />
      </ApplicationReviewSection>
      <ApplicationReviewSection title="STATUS HISTORY">
        <Timeline items={application.statusHistory ?? []} showTitle={false} />
      </ApplicationReviewSection>
    </div>
  );
}

function ApplicationReviewSection({ children, title }) {
  return (
    <section className="application-review-section">
      <h4>{title}</h4>
      {children}
    </section>
  );
}

function ApplicationStatusSummary({ application, showTargetUnit = true }) {
  const items = [
    ["Status", applicationStatusLabel(application.status)],
    ["Submitted", formatDate(application.submittedAt)],
  ];
  if (showTargetUnit) {
    items.splice(1, 0, ["Target unit", application.targetUnit?.name ?? "Not assigned"]);
  }

  return <KeyValueList items={items} />;
}

function ReadOnlyApplication({ application, reviewMode = false }) {
  const servicePeriods = (application.servicePeriods ?? []).map(formatServicePeriod);
  const armaUnits = (application.armaUnits ?? []).map(formatArmaUnit);
  const interestedUnits = (application.interestedUnits ?? []).map((entry) => entry.unit?.name);
  const availability = (application.availabilitySlots ?? []).map((entry) => entry.slotLabel);
  const desiredMOS = (application.desiredMOS ?? []).map(formatDesiredMOS);
  const serviceValue = reviewMode
    ? renderListValue(
        application.priorService ? servicePeriods : [],
        application.priorService ? "No service details recorded." : "No",
      )
    : application.priorService
      ? inlineList(servicePeriods, "No service details recorded.")
      : "No";
  const armaValue = reviewMode
    ? renderListValue(
        application.priorArma ? armaUnits : [],
        application.priorArma ? "No previous Arma details recorded." : "No",
      )
    : application.priorArma
      ? inlineList(armaUnits, "No previous Arma details recorded.")
      : "No";
  const leadershipValue = reviewMode
    ? renderListValue(
        application.leadership
          ? [application.leadershipDetails || "No leadership details recorded."]
          : [],
        application.leadership ? "No leadership details recorded." : "No",
      )
    : application.leadership
      ? application.leadershipDetails || "No leadership details recorded."
      : "No";
  const unitInterestValue = reviewMode
    ? renderListValue(interestedUnits, "No interested units recorded.")
    : inlineList(interestedUnits, "No interested units recorded.");
  const desiredMOSValue = reviewMode
    ? renderListValue(desiredMOS, "No desired MOS choices recorded.")
    : inlineList(desiredMOS, "No desired MOS choices recorded.");
  const availabilityValue = reviewMode
    ? renderListValue(availability, "Not recorded")
    : inlineList(availability, "Not recorded");

  return (
    <div className="readonly-application-form">
      <ReadOnlyField label="Name">
        {personDisplayName(
          { firstName: application.firstName, lastName: application.lastName },
          "Not recorded",
        )}
      </ReadOnlyField>
      <ReadOnlyField label="Age">
        {application.age === null || application.age === undefined
          ? "Not recorded"
          : application.age}
      </ReadOnlyField>
      <ReadOnlyField label="Time Zone">{application.timeZone || "Not recorded"}</ReadOnlyField>
      <ReadOnlyField label="Reason For Joining">
        {application.reasonForJoining || "Not recorded"}
      </ReadOnlyField>
      <ReadOnlyField label="Current/Prior Service">{serviceValue}</ReadOnlyField>
      <ReadOnlyField label="Previous Arma Experience">{armaValue}</ReadOnlyField>
      <ReadOnlyField label="Leadership Experience">{leadershipValue}</ReadOnlyField>
      <ReadOnlyField label="Unit Interest">{unitInterestValue}</ReadOnlyField>
      <ReadOnlyField label="Desired MOS">{desiredMOSValue}</ReadOnlyField>
      <ReadOnlyField label="Availability">{availabilityValue}</ReadOnlyField>
      <ReadOnlyField label="Source">
        {application.source ? humanize(application.source) : "Not recorded"}
      </ReadOnlyField>
    </div>
  );
}

function ReadOnlyField({ children, label }) {
  return (
    <div className="readonly-field">
      <span>{label}</span>
      <div className="readonly-field-value">{children}</div>
    </div>
  );
}

function renderListValue(items, empty) {
  const filtered = (items ?? []).filter(Boolean);
  if (!filtered.length) {
    return empty;
  }

  return (
    <ul className="readonly-response-list">
      {filtered.map((item, index) => (
        <li key={`${index}-${item}`}>{item}</li>
      ))}
    </ul>
  );
}

function inlineList(items, empty) {
  const filtered = (items ?? []).filter(Boolean);
  return filtered.length ? filtered.join("; ") : empty;
}

function Timeline({ items, showTitle = true }) {
  if (!items?.length) {
    return <EmptyState title="No history" detail="No status history has been recorded yet." />;
  }
  return (
    <div className={showTitle ? "mini-list" : "status-history-list"}>
      {showTitle ? <strong>Status History</strong> : null}
      <ul>
        {items.map((item) => (
          <li key={item.id}>
            {item.displayLabel ?? applicationStatusLabel(item.newStatus)} -{" "}
            {formatDateTime(item.createdAt)}
            <br />
            <span>{item.reason}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ApplicationNotesHistory({
  emptyDetail = "No recruiting notes have been recorded yet.",
  items,
}) {
  if (!items?.length) {
    return <EmptyState title="No notes" detail={emptyDetail} />;
  }

  return (
    <div className="status-history-list">
      <ul>
        {items.map((item) => (
          <li key={item.id}>
            {humanize(item.stage ?? "Recruiting note")} - {formatDate(item.createdAt)}
            <br />
            <span>{item.body}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function formatServicePeriod(period) {
  const years =
    period.years === null || period.years === undefined || period.years === ""
      ? null
      : `${period.years} ${Number(period.years) === 1 ? "year" : "years"}`;
  return [period.branch ? humanize(period.branch) : null, period.mos, years]
    .filter(Boolean)
    .join(" | ");
}

function formatArmaUnit(unit) {
  const dates = unit.joinedAt
    ? `${formatMonthYear(unit.joinedAt)} to ${unit.stillMember ? "Present" : formatMonthYear(unit.leftAt)}`
    : null;
  return [unit.unitName, dates, unit.stillMember ? null : unit.reasonLeft || "No reason recorded"]
    .filter(Boolean)
    .join(" | ");
}

function formatDesiredMOS(entry) {
  return mosDisplayLabel(entry.mos, { empty: "" });
}

function blankApplicationForm() {
  return {
    firstName: "",
    lastName: "",
    age: "",
    timeZone: "",
    reasonForJoining: "",
    source: "",
    priorService: false,
    servicePeriods: [],
    priorArma: false,
    armaUnits: [],
    leadership: false,
    leadershipDetails: "",
    interestedUnitIds: [],
    availabilitySlotKeys: [],
    desiredMOSIds: [],
  };
}

function blankTrainingForm() {
  return {
    courseId: "",
    completedAt: todayDateInput(),
    notes: "",
    attendees: [blankTrainingAttendee()],
  };
}

function blankEventForm(sourceUnitId = "") {
  return {
    title: "",
    eventType: "",
    location: "",
    attendanceScope: "",
    sourceUnitId,
    startsAt: "",
    endsAt: "",
    details: "",
  };
}

function blankTrainingAttendee() {
  return {
    personnelProfileId: "",
    outcome: "",
    notes: "",
  };
}

function trainingSessionToForm(session) {
  if (!session) {
    return blankTrainingForm();
  }

  return {
    courseId: session.courseId ?? "",
    completedAt: dateInputValue(session.completedAt),
    notes: session.notes ?? "",
    attendees: (session.records ?? []).length
      ? session.records.map((record) => ({
          personnelProfileId: record.personnelProfileId ?? "",
          outcome: record.outcome ?? "",
          notes: record.notes ?? "",
        }))
      : [blankTrainingAttendee()],
  };
}

function eventToForm(event) {
  if (!event) {
    return blankEventForm();
  }

  return {
    title: event.title ?? "",
    eventType: event.eventType ?? "",
    location: event.location ?? "",
    attendanceScope: event.attendanceScope ?? "",
    sourceUnitId: event.sourceUnitId ?? "",
    startsAt: dateTimeLocalInputValue(event.startsAt),
    endsAt: dateTimeLocalInputValue(event.endsAt),
    details: event.details ?? "",
  };
}

function applicationToForm(application) {
  if (!application) {
    return blankApplicationForm();
  }

  return {
    firstName: application.firstName ?? "",
    lastName: application.lastName ?? "",
    age: application.age == null ? "" : String(application.age),
    timeZone: application.timeZone ?? "",
    reasonForJoining: application.reasonForJoining ?? "",
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
      joinedAt: monthInputValue(unit.joinedAt),
      leftAt: monthInputValue(unit.leftAt),
      stillMember: Boolean(unit.stillMember),
      reasonLeft: unit.reasonLeft ?? "",
    })),
    leadership: Boolean(application.leadership),
    leadershipDetails: application.leadershipDetails ?? "",
    interestedUnitIds: (application.interestedUnits ?? []).map((entry) => entry.unitId),
    availabilitySlotKeys: (application.availabilitySlots ?? []).map((entry) => entry.slotKey),
    desiredMOSIds: (application.desiredMOS ?? []).map((entry) => entry.mosId),
  };
}

function blankPersonnelProfileForm() {
  return {
    name: "",
    status: "",
    currentUnitId: "",
    currentRankId: "",
    currentBilletId: "",
    currentMOSId: "",
    currentSecondaryMOSId: "",
    goodStanding: "true",
  };
}

function blankAdminUserRecordForm() {
  return {
    accountStatus: "",
    personnelStatus: "",
  };
}

function personnelProfileToForm(profile) {
  if (!profile) {
    return blankPersonnelProfileForm();
  }

  const derivedStanding = derivePersonnelStanding(profile.status ?? "");
  return {
    name: profile.name ?? "",
    status: profile.status ?? "",
    currentUnitId: profile.currentUnitId ?? "",
    currentRankId: profile.currentRankId ?? "",
    currentBilletId: profile.currentBilletId ?? "",
    currentMOSId: profile.currentMOSId ?? "",
    currentSecondaryMOSId: profile.currentSecondaryMOSId ?? "",
    goodStanding: String(derivedStanding),
  };
}

function adminUserRecordToForm(record) {
  if (!record) {
    return blankAdminUserRecordForm();
  }

  return {
    accountStatus: record.status ?? "",
    personnelStatus: record.personnelProfile?.status ?? "",
  };
}

function derivePersonnelStanding(status) {
  return !["AWOL", "OtherThanHonorableDischarge", "DishonorableDischarge"].includes(status);
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
  return personDisplayName(
    {
      firstName: application?.firstName,
      lastName: application?.lastName,
      fullName: application?.account?.displayName,
    },
    "Unnamed applicant",
  );
}

function personNameSortParts(fullName, fallback = "") {
  const tokens = String(fullName ?? "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (!tokens.length) {
    return { last: fallback, first: fallback, full: fallback };
  }

  return {
    last: tokens.at(-1)?.toLowerCase() ?? "",
    first: tokens[0]?.toLowerCase() ?? "",
    full: tokens.join(" ").toLowerCase(),
  };
}

function compareNamesByLastName(leftName, rightName) {
  const left = personNameSortParts(leftName);
  const right = personNameSortParts(rightName);
  return (
    left.last.localeCompare(right.last) ||
    left.first.localeCompare(right.first) ||
    left.full.localeCompare(right.full)
  );
}

function compareStrings(left, right) {
  return String(left ?? "").localeCompare(String(right ?? ""), undefined, { sensitivity: "base" });
}

function sortPersonnelRosterItems(items, sortBy) {
  const sorted = [...(items ?? [])];
  sorted.sort((left, right) => {
    if (sortBy === "status") {
      return (
        compareStrings(personnelStatusLabel(left.status), personnelStatusLabel(right.status)) ||
        compareNamesByLastName(left.name, right.name)
      );
    }

    if (sortBy === "unit") {
      return (
        compareStrings(unitDisplayLabel(left.currentUnit), unitDisplayLabel(right.currentUnit)) ||
        compareNamesByLastName(left.name, right.name)
      );
    }

    if (sortBy === "rank") {
      return (
        (right.currentRank?.precedence ?? -1) - (left.currentRank?.precedence ?? -1) ||
        compareNamesByLastName(left.name, right.name)
      );
    }

    if (sortBy === "mos") {
      return (
        compareStrings(formatRosterMos(left), formatRosterMos(right)) ||
        compareNamesByLastName(left.name, right.name)
      );
    }

    return compareNamesByLastName(left.name, right.name);
  });
  return sorted;
}

function personnelOptionLabel(profile) {
  const rank = profile?.currentRank ? rankDisplayLabel(profile.currentRank, { compact: true }) : "";
  const unit = profile?.currentUnit ? unitDisplayLabel(profile.currentUnit) : "";
  const name = personDisplayName({ fullName: profile?.name }, "Unnamed member");
  return [name, rank, unit].filter(Boolean).join(" | ");
}

function accountDisplayName(account, fallback = "another recruiter") {
  const fullName =
    account?.personnelProfile?.name ||
    account?.displayName ||
    account?.authIdentities?.[0]?.displayName ||
    account?.authIdentities?.[0]?.username ||
    "";
  return personDisplayName({ fullName }, fallback);
}

function adminUserRecordName(record) {
  return personDisplayName(
    {
      fullName:
        record?.personnelProfile?.name ||
        record?.displayName ||
        record?.authIdentities?.[0]?.displayName ||
        record?.authIdentities?.[0]?.username,
    },
    "Unknown account",
  );
}

function adminNoteAuthorLabel(note) {
  return accountDisplayName(note?.authorAccount, "System");
}

function roleAccountOptionLabel(account) {
  const identity = account?.authIdentities?.[0];
  const name = personDisplayName(
    {
      fullName:
        account?.personnelProfile?.name ??
        account?.displayName ??
        identity?.displayName ??
        identity?.username,
    },
    "Unknown account",
  );
  const discord = identity
    ? `${identity.username ?? "Discord user"} / ${identity.providerAccountId}`
    : "No Discord identity";
  return `${name} - ${discord} - ${accountStatusLabel(account?.status)}`;
}

function roleScopeLabel(assignment) {
  if (assignment.scopeType === "Unit") {
    return `${assignment.unit?.name ?? "Unknown unit"}${assignment.scopeIncludesDescendants ? " and descendants" : ""}`;
  }
  if (assignment.scopeType === "StaffSection") {
    return assignment.staffSection?.name ?? "Unknown staff section";
  }
  return "Global";
}

function profileFieldValue(viewModel, label) {
  return (
    viewModel.profileFields.find(([fieldLabel]) => fieldLabel === label)?.[1] ?? "Not recorded"
  );
}

function canReopenRecruitingRecord(application, session) {
  if (!application) {
    return false;
  }

  const roleKeys = session?.summary?.roleKeys ?? [];
  return (
    roleKeys.includes("recruiter") &&
    roleKeys.includes("system-admin") &&
    ["Denied", "Withdrawn", "Closed"].includes(application.status)
  );
}

function isClaimedByCurrentUser(application, currentAccountId) {
  return Boolean(
    application?.claimedByAccountId &&
    currentAccountId &&
    application.claimedByAccountId === currentAccountId,
  );
}

function claimButtonTitle(application, currentAccountId) {
  if (isClaimedByCurrentUser(application, currentAccountId)) {
    return "Claimed by you";
  }

  return `Claimed by ${accountDisplayName(application?.claimedByAccount)}`;
}

function intakeAgreementStatusLabel(status) {
  if (status === "agreed") return "Agreed";
  if (status === "stale") return "Stale";
  if (status === "missing") return "Missing";
  return humanize(status || "Missing");
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

function formatDateTime(value) {
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
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function formatMonthYear(value) {
  if (!value) {
    return "Not recorded";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return String(value);
  }

  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    year: "numeric",
  }).format(date);
}

function monthInputValue(value) {
  if (!value) {
    return "";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return date.toISOString().slice(0, 7);
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

function todayDateInput() {
  return new Date().toISOString().slice(0, 10);
}

function dateTimeLocalInputValue(value) {
  if (!value) {
    return "";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  return (
    [
      date.getFullYear().toString().padStart(4, "0"),
      (date.getMonth() + 1).toString().padStart(2, "0"),
      date.getDate().toString().padStart(2, "0"),
    ].join("-") +
    "T" +
    [
      date.getHours().toString().padStart(2, "0"),
      date.getMinutes().toString().padStart(2, "0"),
    ].join(":")
  );
}

function formatEventTime(value) {
  if (!value) {
    return "--:--";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return String(value);
  }

  return new Intl.DateTimeFormat(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function buildEventPayload(form, fallbackSourceUnitId = "") {
  return {
    title: form.title,
    eventType: form.eventType,
    location: form.location,
    attendanceScope: form.attendanceScope,
    sourceUnitId: form.sourceUnitId || fallbackSourceUnitId,
    startsAt: form.startsAt,
    endsAt: form.endsAt,
    details: form.details,
  };
}

function eventListPathForMode(mode) {
  return mode === "staff" ? "/staff/events" : "/user/events";
}

function eventPathForMode(mode, eventId) {
  return `${eventListPathForMode(mode)}/${eventId}`;
}

function groupEventsByDay(items) {
  const groups = new Map();
  for (const item of items ?? []) {
    for (const key of eventDateKeys(item.startsAt, item.endsAt)) {
      const existing = groups.get(key) ?? [];
      existing.push(item);
      groups.set(key, existing);
    }
  }
  return groups;
}

function chunkCalendarDays(days) {
  const weeks = [];
  for (let index = 0; index < days.length; index += 7) {
    weeks.push(days.slice(index, index + 7));
  }
  return weeks;
}

function eventRsvpStatusMessage(event) {
  if (!event) {
    return "Event status unavailable.";
  }

  if (event.status === "Cancelled") {
    return "This event has been cancelled.";
  }

  if (event.currentUserSignupStatus === "Expected") {
    return "You are currently signed up for this event.";
  }

  if (new Date(event.startsAt) <= new Date()) {
    return "RSVPs are closed for this event.";
  }

  if (!event.currentUserEligible) {
    return event.attendanceScope === "UnitOnly"
      ? "This event is limited to members of the owning unit and its descendants."
      : "A personnel profile is required to sign up for this event.";
  }

  return "Sign up if you are available to attend this event.";
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
          <h1>Task Force 20 Integrated Personnel System</h1>
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
  return humanizeIdentifier(value);
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
