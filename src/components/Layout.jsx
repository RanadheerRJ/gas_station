import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Link, NavLink, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../state/AuthContext";
import { watchConnection } from "../lib/pwa";
import { useTheme } from "../state/ThemeContext";
import { LanguageSelect, useLanguage } from "../state/LanguageContext.jsx";
import { useStation } from "../state/useStation.js";
import { routeDirection, useRouteTransition } from "./motion.jsx";
import { PetravLockup } from "./branding.jsx";
import Sheet from "./Sheet.jsx";
import AccountPanel from "./AccountPanel.jsx";
import ListRow from "./ListRow.jsx";
import { Chip } from "./Chip.jsx";
import {
  BackIcon,
  ChartIcon,
  CheckIcon,
  ChevronIcon,
  CreditIcon,
  GlobeIcon,
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

const MOBILE_NAV_LABEL = {
  "nav.creditCustomers": "nav.mobile.credit",
  "nav.groundStock": "nav.mobile.stock",
  "nav.dailyLedger": "nav.mobile.ledger",
  "nav.pumpsRates": "nav.mobile.pumps",
  "nav.staffAccess": "nav.mobile.staff",
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
 * there is room), the mobile tab bar and the More sheet's tile grid, so the
 * three never drift apart.
 */
export function destinationsFor(role) {
  switch (role) {
    case "owner":
      return {
        tabs: [
          { to: "/owner", label: "nav.overview", Icon: StationIcon, end: true },
          { to: "/owner/shifts", label: "nav.shifts", Icon: ShiftIcon },
          { to: "/owner/stock", label: "nav.groundStock", Icon: TankIcon },
          { to: "/owner/credit", label: "nav.creditCustomers", Icon: CreditIcon },
        ],
        more: [
          { to: "/owner/ledger", label: "nav.dailyLedger", Icon: LedgerIcon },
          { to: "/owner/setup", label: "nav.pumpsRates", Icon: RateIcon },
          { to: "/owner/staff", label: "nav.staffAccess", Icon: PeopleIcon },
          { to: "/owner/reports", label: "nav.reports", Icon: ChartIcon },
        ],
      };
    case "manager":
      return {
        tabs: [
          { to: "/station", label: "nav.shifts", Icon: ShiftIcon, end: true },
          { to: "/station/credit", label: "nav.creditCustomers", Icon: CreditIcon },
          { to: "/station/stock", label: "nav.groundStock", Icon: TankIcon },
          { to: "/station/ledger", label: "nav.dailyLedger", Icon: LedgerIcon },
        ],
        more: [
          { to: "/station/staff", label: "nav.staffAccess", Icon: PeopleIcon },
          { to: "/station/reports", label: "nav.reports", Icon: ChartIcon },
        ],
      };
    case "attendant":
      return {
        tabs: [
          { to: "/today", label: "nav.today", Icon: HomeIcon, end: true },
          { to: "/today/credit", label: "nav.creditCustomers", Icon: CreditIcon },
          { to: "/today/stock", label: "nav.groundStock", Icon: TankIcon },
          { to: "/today/history", label: "nav.history", Icon: HistoryIcon },
        ],
        more: [{ to: "/today/account", label: "nav.account", Icon: UserIcon }],
      };
    default:
      return { tabs: [], more: [] };
  }
}

export default function Layout() {
  const { profile, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const { t, language, setLanguage, languages, languageNames } = useLanguage();
  // Hooks must run before any early return, or signing out changes the hook
  // order between renders and React throws.
  const { online, restored } = useConnection();
  const install = useInstallPrompt();
  const { pathname } = useLocation();
  const { stations, station, stationId, setStation } = useStation();
  const [accountOpen, setAccountOpen] = useState(false);
  const [moreOpen, setMoreOpen] = useState(false);
  // The More sheet shows the tile grid, or swaps to the language choices when
  // a Language tile (or the top-bar globe) asked for them.
  const [morePanel, setMorePanel] = useState("tiles");
  const [stationOpen, setStationOpen] = useState(false);

  const { tabs, more } = useMemo(() => destinationsFor(profile?.role), [profile?.role]);
  // Tab switches fade rather than slide — sliding on a lateral move reads as
  // a new stack being pushed, which a tab bar never is.
  const tabPaths = useMemo(() => tabs.map((tab) => tab.to), [tabs]);
  const transitionClass = useRouteTransition(pathname, tabPaths);
  const moreActive = more.some(
    (item) => pathname === item.to || pathname.startsWith(`${item.to}/`)
  );
  const mainRef = useRef(null);

  // The station switcher belongs to the roles that can be shown more than one
  // station. An attendant's station is a fact, not a choice, so it renders as
  // a plain label; the developer and single-station accounts see the brand.
  const canSwitchStation =
    (profile?.role === "owner" || profile?.role === "manager") && stations.length > 1;
  const accountInMore = more.some((item) => item.label === "nav.account");

  useScrollMemory(pathname, tabPaths, mainRef);

  if (!profile) return null;

  const openMoreTiles = () => {
    setMorePanel("tiles");
    setMoreOpen(true);
  };
  const openMoreLanguage = () => {
    setMorePanel("language");
    setMoreOpen(true);
  };

  return (
    <div
      className={`shell shell--${profile.role}${tabs.length > 0 ? " shell--tabs" : ""}`}
    >
      {/* Mobile top bar: the station you are in (or the brand), then the
          device-level controls — theme, language, account — one tap away. */}
      <header className="appbar">
        <div className="appbar__lead">
          {canSwitchStation ? (
            <button
              type="button"
              className="appbar__station"
              onClick={() => setStationOpen(true)}
              aria-haspopup="dialog"
              title={station?.name}
            >
              <StationIcon size={15} />
              <span className="appbar__station-name">{station?.name}</span>
              <span className="appbar__chevron" aria-hidden="true">
                <ChevronIcon size={13} />
              </span>
            </button>
          ) : profile.role === "attendant" && station ? (
            <span
              className="appbar__station appbar__station--static"
              title={station.name}
            >
              <StationIcon size={15} />
              <span className="appbar__station-name">{station.name}</span>
            </span>
          ) : (
            <PetravLockup markSize={26} wordHeight={15} />
          )}
        </div>
        <div className="appbar__tools">
          <button
            type="button"
            className="appbar__tool"
            onClick={toggleTheme}
            aria-label={theme === "dark" ? t("chrome.lightMode") : t("chrome.darkMode")}
          >
            {theme === "dark" ? <SunIcon size={18} /> : <MoonIcon size={18} />}
          </button>
          <button
            type="button"
            className="appbar__tool"
            onClick={openMoreLanguage}
            aria-label={t("chrome.language")}
            aria-haspopup="dialog"
          >
            <GlobeIcon size={18} />
          </button>
          <button
            type="button"
            className="appbar__tool appbar__account"
            onClick={() => setAccountOpen(true)}
            aria-label={t("nav.account")}
          >
            <UserIcon size={18} />
          </button>
        </div>
      </header>

      {/* Desktop: the persistent side nav, unchanged in role, changed in icon. */}
      <aside className="sidebar">
        <div className="brand">
          <PetravLockup markSize={28} wordHeight={16} />
          <div className="who">
            <span className="who__name">{profile.name}</span>
            <span className={`role-pill role-pill--${profile.role}`}>
              {ROLE_LABEL[profile.role] ? t(ROLE_LABEL[profile.role]) : profile.role}
            </span>
          </div>
          {canSwitchStation && (
            <button
              type="button"
              className="sidebar__station"
              onClick={() => setStationOpen(true)}
              aria-haspopup="dialog"
              title={station?.name}
            >
              <StationIcon size={15} />
              <span className="sidebar__station-name">{station?.name}</span>
              <span className="appbar__chevron" aria-hidden="true">
                <ChevronIcon size={13} />
              </span>
            </button>
          )}
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

      <div className="main" ref={mainRef}>
        {!online && (
          <div className="conn-banner" role="status">
            <span className="live-dot">●</span>
            {t("chrome.offline")}
          </div>
        )}

        {online && restored && (
          <div className="conn-banner restored" role="status">
            <span>●</span>
            {t("chrome.backOnline")}
          </div>
        )}

        {install.available && (
          <div className="install-bar">
            <span>{t("chrome.installPrompt")}</span>
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
          more sections than tabs. The visible label is allowed to be shorter
          than the desktop/sidebar label so 375px phones do not show ellipses,
          while aria-label keeps the full destination name for assistive tech.
          The active tab carries a soft pill behind its icon and a bolder
          stroke, so selection is shape and weight, not colour alone. */}
      {tabs.length > 0 && (
        <nav className="tabbar" aria-label={t("chrome.navigation")}>
          {tabs.map((tab) => {
            const Icon = tab.Icon;
            const fullLabel = t(tab.label);
            const mobileLabel = t(MOBILE_NAV_LABEL[tab.label] || tab.label);
            return (
              <NavLink
                key={tab.to}
                to={tab.to}
                end={tab.end}
                aria-label={fullLabel}
                className={({ isActive }) => `tab${isActive ? " active" : ""}`}
              >
                <span className="tab__glyph" aria-hidden="true">
                  <Icon size={22} />
                </span>
                <span>{mobileLabel}</span>
              </NavLink>
            );
          })}
          {more.length > 0 && (
            <button
              type="button"
              className={`tab${moreActive ? " active" : ""}`}
              onClick={openMoreTiles}
              aria-haspopup="dialog"
              aria-expanded={moreOpen}
              aria-label={t("nav.more")}
            >
              <span className="tab__glyph" aria-hidden="true">
                <MoreIcon size={22} />
              </span>
              <span>{t("nav.more")}</span>
            </button>
          )}
        </nav>
      )}

      {/* The More sheet: destinations as a tile grid — every tile is a real
          link or button, presses like a card, and closes the sheet on tap.
          Preferences live here too, so language, theme and sign-out are two
          taps from anywhere on a phone. */}
      <Sheet
        open={moreOpen}
        onClose={() => setMoreOpen(false)}
        title={morePanel === "language" ? t("chrome.language") : t("nav.more")}
      >
        {morePanel === "language" ? (
          <div className="lang-options" role="group" aria-label={t("chrome.language")}>
            {languages.map((code) => (
              <Chip
                key={code}
                className="chip--block"
                label={languageNames[code]}
                selected={language === code}
                onClick={() => {
                  setLanguage(code);
                  setMoreOpen(false);
                }}
              />
            ))}
          </div>
        ) : (
          <div className="more-sheet">
            {more.length > 0 && (
              <>
                <div className="more-sheet__label">{t("more.places")}</div>
                <div className="more-grid">
                  {more.map((item) => (
                    <NavLink
                      key={item.to}
                      to={item.to}
                      end
                      className="more-tile"
                      onClick={() => setMoreOpen(false)}
                    >
                      <span className="more-tile__icon" aria-hidden="true">
                        <item.Icon size={20} />
                      </span>
                      <span>{t(item.label)}</span>
                    </NavLink>
                  ))}
                </div>
              </>
            )}
            <div className="more-sheet__label">{t("account.preferences")}</div>
            <div className="more-grid">
              {/* Attendants reach Account as a destination tile above (it is
                  their More entry); owner and manager get the account sheet. */}
              {!accountInMore && (
                <button
                  type="button"
                  className="more-tile"
                  onClick={() => {
                    setMoreOpen(false);
                    setAccountOpen(true);
                  }}
                >
                  <span className="more-tile__icon" aria-hidden="true">
                    <UserIcon size={20} />
                  </span>
                  <span>{t("nav.account")}</span>
                </button>
              )}
              <button type="button" className="more-tile" onClick={openMoreLanguage}>
                <span className="more-tile__icon" aria-hidden="true">
                  <GlobeIcon size={20} />
                </span>
                <span>{t("chrome.language")}</span>
              </button>
              <button
                type="button"
                className="more-tile"
                onClick={() => {
                  toggleTheme();
                  setMoreOpen(false);
                }}
              >
                <span className="more-tile__icon" aria-hidden="true">
                  {theme === "dark" ? <SunIcon size={20} /> : <MoonIcon size={20} />}
                </span>
                <span>
                  {theme === "dark" ? t("chrome.lightMode") : t("chrome.darkMode")}
                </span>
              </button>
              <button
                type="button"
                className="more-tile more-tile--danger"
                onClick={logout}
              >
                <span className="more-tile__icon" aria-hidden="true">
                  <LogOutIcon size={20} />
                </span>
                <span>{t("chrome.signOut")}</span>
              </button>
            </div>
          </div>
        )}
      </Sheet>

      {/* The station switcher's sheet: the current station is checked, and
          picking one re-filters every station-scoped screen via ?station=. */}
      <Sheet
        open={stationOpen}
        onClose={() => setStationOpen(false)}
        title={t("chrome.switchStation")}
      >
        <div className="station-sheet">
          {stations.map((s) => (
            <ListRow
              key={s.id}
              icon={StationIcon}
              title={s.name}
              chevron={false}
              aria-current={s.id === stationId ? "true" : undefined}
              trailing={
                s.id === stationId ? (
                  <span className="station-sheet__check">
                    <CheckIcon size={18} />
                  </span>
                ) : null
              }
              onClick={() => {
                setStation(s.id);
                setStationOpen(false);
              }}
            />
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

/* ------------------------------------------------------------------ */
/* scroll memory: top on a new screen, back where you were on return   */
/* ------------------------------------------------------------------ */

/**
 * Scroll behaviour between screens: drilling deeper starts the new screen at
 * the top; anything else — going back, or switching between top-level tabs —
 * returns a screen to wherever it was scrolled when the user left it, the
 * way a browser's back button (or a delivery app's tab bar) does.
 *
 * Positions are remembered per pathname for the life of the session. A
 * restored position is re-applied on the next frame because a lazy screen
 * mounts after the navigation, and the browser clamps scrollTop to the
 * content height it finds at that instant.
 */
function useScrollMemory(pathname, tabPaths, mainRef) {
  const memory = useRef(new Map());
  const prevPathname = useRef(null);
  const tabPathsRef = useRef(tabPaths);
  tabPathsRef.current = tabPaths;

  useLayoutEffect(() => {
    const main = mainRef.current;
    const previous = prevPathname.current;
    prevPathname.current = pathname;
    if (!main || previous === pathname) return undefined;

    if (previous) memory.current.set(previous, main.scrollTop);
    const direction = routeDirection(previous, pathname, tabPathsRef.current);
    const saved = memory.current.get(pathname);
    // Drilling deeper starts the new screen at the top; going back — or
    // switching between top-level tabs — returns to where it was left.
    const target = direction === "forward" ? 0 : (saved ?? 0);
    main.scrollTop = target;
    if (!(target > 0)) return undefined;

    const raf =
      typeof requestAnimationFrame === "function"
        ? requestAnimationFrame(() => {
            main.scrollTop = memory.current.get(pathname) ?? target;
          })
        : null;
    return () => {
      if (raf != null && typeof cancelAnimationFrame === "function") {
        cancelAnimationFrame(raf);
      }
    };
  }, [pathname, mainRef]);
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
 *
 * `back` is a router target — a path string, or the `{ pathname, search }`
 * object `useStation`'s `link()` builds so the `?station=` filter survives
 * the round trip. It goes to the Link untouched: a back arrow that resolves
 * to the screen it is already on (which is what an undefined `to` does,
 * silently) is a button that does nothing.
 */
export function ScreenHeader({ title, sub, actions, filter, back }) {
  const { t } = useLanguage();
  return (
    <header className="screen-head">
      <div className="screen-head__row">
        {back && (
          <Link to={back} className="back-link" aria-label={t("common.back")}>
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
    // Reads the PÉTRAV key, falling back to the pre-rename one so an
    // upgrade does not re-prompt someone who already said no.
    () =>
      localStorage.getItem("petrav.install.dismissed") === "1" ||
      localStorage.getItem("pumpmithra.install.dismissed") === "1"
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
      localStorage.setItem("petrav.install.dismissed", "1");
      setDismissed(true);
    },
  };
}
