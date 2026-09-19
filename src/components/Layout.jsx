import { useEffect, useRef, useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import { useAuth } from "../state/AuthContext";
import { watchConnection } from "../lib/pwa";
import { useTheme } from "../state/ThemeContext";
import {
  CreditIcon,
  LedgerIcon,
  PeopleIcon,
  PumpIcon,
  ShiftIcon,
  StationIcon,
  TankIcon,
} from "./icons";

const ROLE_LABEL = {
  admin: "Developer",
  owner: "Owner",
  manager: "Manager",
  attendant: "Attendant",
};

/** A small badge per role, so who you are signed in as is obvious at a glance. */
const ROLE_EMOJI = {
  admin: "🛠️",
  owner: "🏪",
  manager: "📋",
  attendant: "⛽",
};

/** Nav is strictly role-scoped: a developer only invites owners, an
 *  attendant only sees today’s entry. The emoji is decorative — the label
 *  carries the meaning, and the icon stays for consistent alignment. */
function navFor(profile) {
  switch (profile.role) {
    case "admin":
      return [
        { to: "/admin", label: "Invite Owner", icon: PeopleIcon, emoji: "✉️", end: true },
      ];
    case "owner":
      return [
        {
          to: "/owner",
          label: "All stations",
          icon: StationIcon,
          emoji: "🏪",
          end: true,
        },
        { to: "/owner/shifts", label: "Shifts", icon: ShiftIcon, emoji: "🧾" },
        { to: "/owner/setup", label: "Pumps & rates", icon: PumpIcon, emoji: "⛽" },
        { to: "/owner/stock", label: "Ground stock", icon: TankIcon, emoji: "🛢️" },
        { to: "/owner/ledger", label: "Daily ledger", icon: LedgerIcon, emoji: "📊" },
        { to: "/owner/credit", label: "Credit customers", icon: CreditIcon, emoji: "💳" },
        { to: "/owner/staff", label: "Staff & access", icon: PeopleIcon, emoji: "👥" },
      ];
    case "manager":
      return [
        { to: "/station", label: "Shifts", icon: ShiftIcon, emoji: "🧾", end: true },
        { to: "/station/stock", label: "Ground stock", icon: TankIcon, emoji: "🛢️" },
        { to: "/station/ledger", label: "Daily ledger", icon: LedgerIcon, emoji: "📊" },
        {
          to: "/station/credit",
          label: "Credit customers",
          icon: CreditIcon,
          emoji: "💳",
        },
      ];
    case "attendant":
      return [{ to: "/today", label: "Shift", icon: ShiftIcon, emoji: "🧾", end: true }];
    default:
      return [];
  }
}

export default function Layout() {
  const { profile, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  // Hooks must run before any early return, or signing out changes the hook
  // order between renders and React throws.
  const { online, restored } = useConnection();
  const install = useInstallPrompt();
  const { pathname } = useLocation();

  if (!profile) return null;
  const links = navFor(profile);

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="mark">STATION LEDGER</div>
          <div className="who">
            <span className="who__name">{profile.name}</span>
            <span className={`role-pill role-pill--${profile.role}`}>
              <span aria-hidden="true">{ROLE_EMOJI[profile.role] || "•"}</span>
              {ROLE_LABEL[profile.role] || profile.role}
            </span>
          </div>
        </div>
        <nav>
          {links.map((l) => {
            const Icon = l.icon;
            return (
              <NavLink key={l.to} to={l.to} end={l.end}>
                {l.emoji && (
                  <span className="nav-emoji" aria-hidden="true">
                    {l.emoji}
                  </span>
                )}
                {Icon && <Icon size={16} />}
                <span>{l.label}</span>
              </NavLink>
            );
          })}
        </nav>
        <div className="foot">
          {profile.username && (
            <div className="small" style={{ color: "var(--muted)", marginBottom: 8 }}>
              signed in as <span className="mono">{profile.username}</span>
            </div>
          )}
          <button
            type="button"
            className="theme-toggle theme-toggle--sidebar"
            onClick={toggleTheme}
          >
            {theme === "dark" ? "☀ Light mode" : "☾ Dark mode"}
          </button>
          <button type="button" className="small" onClick={logout}>
            Sign out
          </button>
        </div>
      </aside>

      <div className="main">
        {!online && (
          <div className="conn-banner">
            <span className="live-dot">●</span>
            Offline — showing the last data loaded. Anything you save will fail until the
            connection returns.
          </div>
        )}

        {online && restored && (
          <div className="conn-banner restored">
            <span>●</span>
            Back online — saving works again.
          </div>
        )}

        {install.available && (
          <div className="install-bar">
            <span style={{ flex: 1 }}>
              Install Station Ledger on this device for full-screen use and faster starts.
            </span>
            <button type="button" onClick={install.prompt}>
              Install
            </button>
            <button type="button" className="ghost" onClick={install.dismiss}>
              Not now
            </button>
          </div>
        )}

        {/* Keyed on the path so the fade replays on every navigation rather
            than only on first mount. */}
        <div className="route-fade" key={pathname}>
          <Outlet />
        </div>
      </div>
    </div>
  );
}

export function PageHeader({ title, sub, actions }) {
  return (
    <div className="topbar">
      <div>
        <h1>{title}</h1>
        {sub && <div className="sub">{sub}</div>}
      </div>
      {actions}
    </div>
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
    () => localStorage.getItem("stationledger.install.dismissed") === "1"
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
      localStorage.setItem("stationledger.install.dismissed", "1");
      setDismissed(true);
    },
  };
}
