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
  personnelStatusLabel,
  rankDisplayLabel,
  trainingCourseDisplayLabel,
  trainingOutcomeLabel,
  unitDisplayLabel,
} from "../../shared/display-labels.mjs";
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

const CURRENT_UNITS = ["A Co, 1/75th Ranger Regiment", "1 Troop, A Squadron, 1st SFOD-Delta"];

const CURRENT_MOS_OPENINGS = [
  "11B Infantryman",
  "11C Mortarman",
  "12B Combat Engineer",
  "13F Joint Fire Support Specialist",
  "15W Unmanned Aerial Systems Operator",
  "25C Radio Operator-Maintainer",
  "25E Electromagnetic Spectrum Manager [requires Contact DLC]",
  "68W Combat Medic",
  "74D CBRN Specialist [requires Contact DLC]",
];

const FUTURE_UNITS = [
  "1-RRC, STB, 75th RR",
  "B Co, 2/160th SOAR",
  "1st Joint Special Operations Air Component",
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
  useEffect(() => {
    const previousTitle = document.title;
    document.title = "Task Force 20 | Arma 3 Realism Unit";
    return () => {
      document.title = previousTitle;
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
            <PublicList title="Current MOS Openings" items={CURRENT_MOS_OPENINGS} />
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

function PortalShell({ path, session, onNavigate }) {
  const [detailCollapsed, setDetailCollapsed] = useState(false);
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
  const displayName =
    session.summary?.account?.displayName ??
    session.summary?.authIdentity?.displayName ??
    session.summary?.authIdentity?.username ??
    "TF20 user";
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
    case "training_records":
      return <TrainingRecordsWorkspace />;
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
      <PersonnelProfileHeading actions={actions} title={viewModel.title} />
      <ApplicationReviewSection title="PERSONNEL STATUS">
        <KeyValueList items={viewModel.personnelStatus} />
      </ApplicationReviewSection>
      <ApplicationReviewSection title="ASSIGNMENT">
        <KeyValueList items={viewModel.assignment} />
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
    </div>
  );
}

function PersonnelProfileHeading({ actions = null, title }) {
  return (
    <div className="personnel-profile-heading">
      <h3 className="personnel-profile-title">{title}</h3>
      {actions ? <div className="button-row">{actions}</div> : null}
    </div>
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

  return (
    <div className="workspace-grid">
      <section className="wide-panel">
        <PanelHeader title="Staff Personnel Roster" />
        <ResourceContent
          onOpenPersonnel={(id) =>
            onNavigate(`/staff/personnel-management/${encodeURIComponent(id)}`)
          }
          resource={resource}
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
            <PersonnelProfileHeading actions={actions} title={viewModel.title} />
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
  return (
    <>
      <ApplicationReviewSection title="PERSONNEL STATUS">
        <div className="form-grid">
          <Field label="Name">
            <input value={form.name} onChange={(event) => onChange("name", event.target.value)} />
          </Field>
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
            <select
              value={form.goodStanding}
              onChange={(event) => onChange("goodStanding", event.target.value)}
            >
              {(options.standingOptions ?? defaultStandingOptions()).map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </Field>
        </div>
        <KeyValueList items={viewModel.personnelStatus.slice(2)} />
      </ApplicationReviewSection>
      <ApplicationReviewSection title="ASSIGNMENT">
        <div className="form-grid">
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
  const options = resource.data?.options ?? {
    sources: [],
    branches: [],
    timeZones: [],
    units: [],
    mos: [],
  };
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

function ApplicationsWorkspace({ applicationId = null, session, onNavigate }) {
  if (applicationId) {
    return (
      <ApplicationDetailWorkspace
        applicationId={applicationId}
        session={session}
        onNavigate={onNavigate}
      />
    );
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
              <td>{item.name}</td>
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
  onClaim = null,
  onOpen = null,
  showClaimColumn = false,
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

function ApplicationForm({ form, options, setForm }) {
  const selectedUnits = new Set(form.interestedUnitIds);
  const mosOptions = selectedUnits.size
    ? (options.mos ?? []).filter((mos) => selectedUnits.has(mos.unitId))
    : [];
  const timeZones = options.timeZones ?? [];

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
            emptyMessage="No recruiting-open 7000-level units are available."
            getLabel={(unit) => unit.name}
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
                ? "No recruiting-open MOS choices are available for the selected unit."
                : "Select an interested unit first."
            }
            getLabel={(mos) => mosDisplayLabel(mos)}
            items={mosOptions}
            label="INTERESTED MOS"
            selectedIds={form.desiredMOSIds}
            onToggle={toggleDesiredMOS}
          />
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
        <ReadOnlyApplication application={application} />
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
        <ReadOnlyApplication application={application} />
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

function ReadOnlyApplication({ application }) {
  const servicePeriods = (application.servicePeriods ?? []).map(formatServicePeriod);
  const armaUnits = (application.armaUnits ?? []).map(formatArmaUnit);
  const interestedUnits = (application.interestedUnits ?? []).map((entry) => entry.unit?.name);
  const desiredMOS = (application.desiredMOS ?? []).map(formatDesiredMOS);
  const serviceValue = application.priorService
    ? inlineList(servicePeriods, "No service details recorded.")
    : "No";
  const armaValue = application.priorArma
    ? inlineList(armaUnits, "No previous Arma details recorded.")
    : "No";
  const leadershipValue = application.leadership
    ? application.leadershipDetails || "No leadership details recorded."
    : "No";

  return (
    <div className="readonly-application-form">
      <ReadOnlyField label="Name">
        {[application.firstName, application.lastName].filter(Boolean).join(" ") || "Not recorded"}
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
      <ReadOnlyField label="Unit Interest">
        {inlineList(interestedUnits, "No interested units recorded.")}
      </ReadOnlyField>
      <ReadOnlyField label="Desired MOS">
        {inlineList(desiredMOS, "No desired MOS choices recorded.")}
      </ReadOnlyField>
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
      <strong>{children}</strong>
    </div>
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
            {applicationStatusLabel(item.newStatus)} - {formatDate(item.createdAt)}
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

function personnelProfileToForm(profile) {
  if (!profile) {
    return blankPersonnelProfileForm();
  }

  return {
    name: profile.name ?? "",
    status: profile.status ?? "",
    currentUnitId: profile.currentUnitId ?? "",
    currentRankId: profile.currentRankId ?? "",
    currentBilletId: profile.currentBilletId ?? "",
    currentMOSId: profile.currentMOSId ?? "",
    currentSecondaryMOSId: profile.currentSecondaryMOSId ?? "",
    goodStanding: String(profile.goodStanding ?? true),
  };
}

function defaultStandingOptions() {
  return [
    { value: "true", label: "Good" },
    { value: "false", label: "Restricted" },
  ];
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

function personnelOptionLabel(profile) {
  const rank = profile?.currentRank ? rankDisplayLabel(profile.currentRank, { compact: true }) : "";
  const unit = profile?.currentUnit ? unitDisplayLabel(profile.currentUnit) : "";
  return [profile?.name, rank, unit].filter(Boolean).join(" | ") || "Unnamed member";
}

function accountDisplayName(account, fallback = "another recruiter") {
  return (
    account?.displayName ||
    account?.authIdentities?.[0]?.displayName ||
    account?.authIdentities?.[0]?.username ||
    fallback
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
