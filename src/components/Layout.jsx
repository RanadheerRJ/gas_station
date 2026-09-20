import { useEffect, useMemo, useRef, useState } from "react";
import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../state/AuthContext";
import { watchConnection } from "../lib/pwa";
import { useTheme } from "../state/ThemeContext";
import { LanguageSelect, useLanguage } from "../state/LanguageContext.jsx";
import { useRouteTransition } from "./motion.jsx";
import Sheet from "./Sheet.jsx";
import AccountPanel from "./AccountPanel.jsx";
import {
  BackIcon,
  ChevronIcon,
  CreditIcon,
  HistoryIcon,
  HomeIcon,
  LedgerIcon,
  LogOutIcon,
  MoonIcon,
  MoreIcon,
  PeopleIcon,
  RateIcon,
  ShiftIcon,
  StationIcon,
  SunIcon,
  TankIcon,
  UserIcon,
} from "./icons.jsx";

const ROLE_LABEL = {
  admin: "role.admin",
  owner: "role.owner",
  manager: "role.manager",
  attendant: "role.attendant",
};

/**
 * Each role's destinations, split into bottom-tab entries and overflow.
 *
 * Tabs are capped at five: four real destinations plus "More" once a role has
 * more sections than tabs (the owner and the manager). The developer's screen
 * is a single page, so it gets no tab bar at all — one tab is a label, not a
 * menu.
 *
 * The same list drives the desktop sidebar (where everything is shown flat —
 * there is room) and the mobile tab bar, so the two never drift apart.
 */
function destinationsFor(role) {
  switch (role) {
    case "owner":
      return {
        tabs: [
          { to: "/owner", label: "nav.overview", Icon: StationIcon, end: true },
          { to: "/owner/shifts", label: "nav.shifts", Icon: ShiftIcon },
          { to: "/owner/stock", label: "nav.groundStock", Icon: TankIcon },
          { to: "/owner/ledger", label: "nav.dailyLedger", Icon: LedgerIcon },
        ],
        more: [
          { to: "/owner/setup", label: "nav.pumpsRates", Icon: RateIcon },
          { to: "/owner/credit", label: "nav.creditCustomers", Icon: CreditIcon },
          { to: "/owner/staff", label: "nav.staffAccess", Icon: PeopleIcon },
        ],
      };
    case "manager":
      return {
        tabs: [
          { to: "/station", label: "nav.shifts", Icon: ShiftIcon, end: true },
          { to: "/station/stock", label: "nav.groundStock", Icon: TankIcon },
          { to: "/station/ledger", label: "nav.dailyLedger", Icon: LedgerIcon },
          { to: "/station/credit", label: "nav.creditCustomers", Icon: CreditIcon },
        ],
        more: [{ to: "/station/staff", label: "nav.staffAccess", Icon: PeopleIcon }],
      };
    case "attendant":
      return {
        tabs: [
          { to: "/today", label: "nav.today", Icon: HomeIcon, end: true },
          { to: "/today/stock", label: "nav.groundStock", Icon: TankIcon },
          { to: "/today/history", label: "nav.history", Icon: HistoryIcon },
          { to: "/today/account", label: "nav.account", Icon: UserIcon },
        ],
        more: [],
      };
    default:
      return { tabs: [], more: [] };
  }
}

export default function Layout() {
  const { profile, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const { t } = useLanguage();
  // Hooks must run before any early return, or signing out changes the hook
  // order between renders and React throws.
  const { online, restored } = useConnection();
  const install = useInstallPrompt();
  const { pathname } = useLocation();
  const [accountOpen, setAccountOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);

  const { tabs, more } = useMemo(() => destinationsFor(profile?.role), [profile?.role]);
  // Tab switches fade rather than slide — sliding on a lateral move reads as
  // a new stack being pushed, which a tab bar never is.
  const tabPaths = useMemo(() => tabs.map((tab) => tab.to), [tabs]);
  const transitionClass = useRouteTransition(pathname, tabPaths);
  const moreActive = more.some(
    (item) => pathname === item.to || pathname.startsWith(`${item.to}/`)
  );

  if (!profile) return null;

  return (
    <div
      className={`shell shell--${profile.role}${tabs.length > 0 ? " shell--tabs" : ""}`}
    >
      {/* Mobile top bar: brand at a glance, account one tap away. */}
      <header className="appbar">
        <div className="brand-lockup">
          <img
            src={`${import.meta.env.BASE_URL}logo.svg`}
            alt=""
            className="brand-logo"
          />
          <div className="mark">PUMPMITHRA</div>
        </div>
        <button
          type="button"
          className="appbar__account"
          onClick={() => setAccountOpen(true)}
          aria-label={t("nav.account")}
        >
          <UserIcon size={17} />
        </button>
      </header>

      {/* Desktop: the persistent side nav, unchanged in role, changed in icon. */}
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-lockup">
            <img
              src={`${import.meta.env.BASE_URL}logo.svg`}
              alt=""
              className="brand-logo"
            />
            <div className="mark">PUMPMITHRA</div>
          </div>
          <div className="who">
            <span className="who__name">{profile.name}</span>
            <span className={`role-pill role-pill--${profile.role}`}>
              {ROLE_LABEL[profile.role] ? t(ROLE_LABEL[profile.role]) : profile.role}
            </span>
          </div>
        </div>
        <nav>
          {tabs.map((tab) => (
            <SidebarLink key={tab.to} item={tab} translate={t} />
          ))}
          {more.length > 0 && <div className="sidebar__group">{t("nav.more")}</div>}
          {more.map((item) => (
            <SidebarLink key={item.to} item={item} translate={t} />
          ))}
        </nav>
        <div className="foot">
          {profile.username && (
            <div className="small" style={{ color: "var(--muted)", marginBottom: 8 }}>
              {t("chrome.signedInAs")} <span className="mono">{profile.username}</span>
            </div>
          )}
          <LanguageSelect className="language-select--sidebar" />
          <button
            type="button"
            className="theme-toggle theme-toggle--sidebar"
            onClick={toggleTheme}
          >
            {theme === "dark" ? <SunIcon size={15} /> : <MoonIcon size={15} />}
            {theme === "dark" ? t("chrome.lightMode") : t("chrome.darkMode")}
          </button>
          <button type="button" className="small sidebar__signout" onClick={logout}>
            <LogOutIcon size={15} />
            {t("chrome.signOut")}
          </button>
        </div>
      </aside>

      <div className="main">
        {!online && (
          <div className="conn-banner">
            <span className="live-dot">●</span>
            {t("chrome.offline")}
          </div>
        )}

        {online && restored && (
          <div className="conn-banner restored">
            <span>●</span>
            {t("chrome.backOnline")}
          </div>
        )}

        {install.available && (
          <div className="install-bar">
            <span style={{ flex: 1 }}>{t("chrome.installPrompt")}</span>
            <button type="button" onClick={install.prompt}>
              {t("chrome.install")}
            </button>
            <button type="button" className="ghost" onClick={install.dismiss}>
              {t("chrome.notNow")}
            </button>
          </div>
        )}

        {/* Keyed on the path so the transition replays on every navigation.
            The class says which way the screen is travelling; reduced-motion
            users always get the plain fade (see motion.jsx). */}
        <div className={transitionClass} key={pathname}>
          <Outlet />
        </div>
      </div>

      {/* Mobile bottom tabs: four destinations plus "More" when a role has
          more sections than tabs. */}
      {tabs.length > 0 && (
        <nav className="tabbar" aria-label={t("chrome.navigation")}>
          {tabs.map((tab) => {
            const Icon = tab.Icon;
            return (
              <NavLink
                key={tab.to}
                to={tab.to}
                end={tab.end}
                className={({ isActive }) => `tab${isActive ? " active" : ""}`}
              >
                <Icon size={21} />
                <span>{t(tab.label)}</span>
              </NavLink>
            );
          })}
          {more.length > 0 && (
            <button
              type="button"
              className={`tab${moreActive ? " active" : ""}`}
              onClick={() => setMoreOpen(true)}
              aria-haspopup="dialog"
            >
              <MoreIcon size={21} />
              <span>{t("nav.more")}</span>
            </button>
          )}
        </nav>
      )}

      <Sheet open={moreOpen} onClose={() => setMoreOpen(false)} title={t("nav.more")}>
        <div className="more-list">
          {more.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end
              className="more-list__item"
              onClick={() => setMoreOpen(false)}
            >
              <item.Icon size={19} />
              <span>{t(item.label)}</span>
              <ChevronIcon size={15} />
            </NavLink>
          ))}
        </div>
      </Sheet>

      {/* The account sheet is the tab-bar overflow for roles whose tabs are
          all used up by real destinations. */}
      <Sheet
        open={accountOpen}
        onClose={() => setAccountOpen(false)}
        title={t("nav.account")}
      >
        <AccountPanel onDone={() => setAccountOpen(false)} />
      </Sheet>
    </div>
  );
}

function SidebarLink({ item, translate }) {
  const Icon = item.Icon;
  return (
    <NavLink to={item.to} end={item.end}>
      <Icon size={17} />
      <span>{translate(item.label)}</span>
    </NavLink>
  );
}

/**
 * A screen's title block. Screens are single-purpose now, so the header
 * carries the title, an optional one-line context (`sub`), the back link for
 * drill-downs, and the screen's filters/actions — nothing else.
 */
export function ScreenHeader({ title, sub, actions, filter, back }) {
  const { t } = useLanguage();
  return (
    <header className="screen-head">
      <div className="screen-head__row">
        {back && (
          <Link to={back.to} className="back-link" aria-label={t("common.back")}>
            <BackIcon size={19} />
          </Link>
        )}
        <div className="screen-head__titles">
          <h1>{title}</h1>
          {sub && <div className="sub">{sub}</div>}
        </div>
        {(filter || actions) && (
          <div className="screen-head__actions">
            {filter}
            {actions}
          </div>
        )}
      </div>
    </header>
  );
}

/** True while the browser reports a usable connection. */
/**
 * Connection state, plus a brief "back online" acknowledgement.
 *
 * Dropping the offline bar the instant the network returns leaves the user
 * unsure whether it recovered or they imagined it, so the bar turns green and
 * states the fact for a couple of seconds before collapsing.
 */
function useConnection() {
  const [online, setOnline] = useState(true);
  const [restored, setRestored] = useState(false);
  const wasOffline = useRef(false);

  useEffect(() => watchConnection(setOnline), []);

  useEffect(() => {
    if (!online) {
      wasOffline.current = true;
      setRestored(false);
      return undefined;
    }
    if (!wasOffline.current) return undefined;
    wasOffline.current = false;
    setRestored(true);
    const timer = setTimeout(() => setRestored(false), 2600);
    return () => clearTimeout(timer);
  }, [online]);

  return { online, restored };
}

/**
 * Chrome fires beforeinstallprompt instead of showing its own banner, so the
 * app has to offer installation itself. Dismissal is remembered — nobody
 * wants to refuse the same bar twice a day.
 */
function useInstallPrompt() {
  const [deferred, setDeferred] = useState(null);
  const [dismissed, setDismissed] = useState(
    () => localStorage.getItem("pumpmithra.install.dismissed") === "1"
  );

  useEffect(() => {
    const onPrompt = (e) => {
      e.preventDefault();
      setDeferred(e);
    };
    const onInstalled = () => setDeferred(null);
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  return {
    available: !!deferred && !dismissed,
    prompt: async () => {
      if (!deferred) return;
      deferred.prompt();
      await deferred.userChoice;
      setDeferred(null);
    },
    dismiss: () => {
      localStorage.setItem("pumpmithra.install.dismissed", "1");
      setDismissed(true);
    },
  };
}
