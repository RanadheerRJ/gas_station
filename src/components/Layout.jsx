import { useEffect, useState } from "react";
import { NavLink, Outlet } from "react-router-dom";
import { useAuth } from "../state/AuthContext";
import { backendInfo } from "../lib/api";
import { watchConnection } from "../lib/pwa";
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

/** Nav is strictly role-scoped: a developer only invites owners, an
 *  attendant only sees today's entry. */
function navFor(profile) {
  switch (profile.role) {
    case "admin":
      return [{ to: "/admin", label: "Invite Owner", icon: PeopleIcon, end: true }];
    case "owner":
      return [
        { to: "/owner", label: "All stations", icon: StationIcon, end: true },
        { to: "/owner/shifts", label: "Shifts", icon: ShiftIcon },
        { to: "/owner/setup", label: "Pumps & rates", icon: PumpIcon },
        { to: "/owner/stock", label: "Ground stock", icon: TankIcon },
        { to: "/owner/ledger", label: "Daily ledger", icon: LedgerIcon },
        { to: "/owner/credit", label: "Credit customers", icon: CreditIcon },
        { to: "/owner/staff", label: "Staff & access", icon: PeopleIcon },
      ];
    case "manager":
      return [
        { to: "/station", label: "Shifts", icon: ShiftIcon, end: true },
        { to: "/station/stock", label: "Ground stock", icon: TankIcon },
        { to: "/station/ledger", label: "Daily ledger", icon: LedgerIcon },
        { to: "/station/credit", label: "Credit customers", icon: CreditIcon },
      ];
    case "attendant":
      return [{ to: "/today", label: "Shift", icon: ShiftIcon, end: true }];
    default:
      return [];
  }
}

export default function Layout() {
  const { profile, logout } = useAuth();
  if (!profile) return null;

  const links = navFor(profile);
  const online = useConnection();
  const install = useInstallPrompt();

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="mark">STATION LEDGER</div>
          <div className="who">
            {profile.name} · {ROLE_LABEL[profile.role] || profile.role}
          </div>
        </div>
        <nav>
          {links.map((l) => {
            const Icon = l.icon;
            return (
              <NavLink key={l.to} to={l.to} end={l.end}>
                {Icon && <Icon size={16} />}
                <span>{l.label}</span>
              </NavLink>
            );
          })}
        </nav>
        <div className="foot">
          {profile.username && (
            <div className="small" style={{ color: "#7f8b93", marginBottom: 8 }}>
              signed in as <span className="mono">{profile.username}</span>
            </div>
          )}
          <button type="button" className="small" onClick={logout}>
            Sign out
          </button>
        </div>
      </aside>

      <div className="main">
        {!online && (
          <div className="conn-banner">
            <span className="live-dot">●</span>
            Offline — showing the last data loaded. Anything you save will fail
            until the connection returns.
          </div>
        )}

        {install.available && (
          <div className="install-bar">
            <span style={{ flex: 1 }}>
              Install Station Ledger on this device for full-screen use and
              faster starts.
            </span>
            <button type="button" onClick={install.prompt}>
              Install
            </button>
            <button type="button" className="ghost" onClick={install.dismiss}>
              Not now
            </button>
          </div>
        )}

        {backendInfo.isDemo && (
          <div
            className="small"
            style={{
              background: "#2e4756",
              color: "#dfe6ea",
              padding: "6px 24px",
            }}
          >
            Demo mode — no Firebase project configured, data is stored in this browser.
            Add <span className="mono">.env.local</span> credentials to use live
            Firestore and Cloud Functions.
          </div>
        )}
        <Outlet />
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
function useConnection() {
  const [online, setOnline] = useState(true);
  useEffect(() => watchConnection(setOnline), []);
  return online;
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
