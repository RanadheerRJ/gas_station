import { NavLink, Outlet } from "react-router-dom";
import { useAuth } from "../state/AuthContext";
import { backendInfo } from "../lib/api";
import {
  CreditIcon,
  LedgerIcon,
  PeopleIcon,
  PumpIcon,
  ShiftIcon,
  StationIcon,
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
        { to: "/owner/ledger", label: "Daily ledger", icon: LedgerIcon },
        { to: "/owner/credit", label: "Credit customers", icon: CreditIcon },
        { to: "/owner/staff", label: "Staff & access", icon: PeopleIcon },
      ];
    case "manager":
      return [
        { to: "/station", label: "Shifts", icon: ShiftIcon, end: true },
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
