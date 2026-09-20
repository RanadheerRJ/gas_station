import { useAuth } from "../state/AuthContext";
import { useTheme } from "../state/ThemeContext";
import { LanguageSelect, useLanguage } from "../state/LanguageContext.jsx";
import { LogOutIcon, MoonIcon, SunIcon } from "./icons.jsx";

const ROLE_LABEL = {
  admin: "role.admin",
  owner: "role.owner",
  manager: "role.manager",
  attendant: "role.attendant",
};

/** Initials for the avatar circle; falls back to the role's first letter. */
function initials(name) {
  const parts = String(name || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length === 0) return "·";
  return parts
    .slice(0, 2)
    .map((part) => part[0])
    .join("")
    .toUpperCase();
}

/**
 * Who is signed in, and the device-level preferences that travel with them.
 * Rendered both as the attendant's Account tab and (for roles whose tab bar
 * is full) inside the account sheet behind the avatar button.
 */
export default function AccountPanel({ onDone }) {
  const { profile, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const { t } = useLanguage();

  return (
    <div className="account-panel">
      <div className="account-panel__id">
        <div className="avatar" aria-hidden="true">
          {initials(profile.name)}
        </div>
        <div>
          <div className="account-panel__name">{profile.name}</div>
          <div className="small muted">
            {profile.username ? (
              <>
                <span className="mono">{profile.username}</span> ·{" "}
              </>
            ) : null}
            {ROLE_LABEL[profile.role] ? t(ROLE_LABEL[profile.role]) : profile.role}
          </div>
        </div>
      </div>

      <LanguageSelect className="account-panel__control" />

      <button
        type="button"
        className="account-panel__control account-panel__button"
        onClick={toggleTheme}
      >
        {theme === "dark" ? <SunIcon size={16} /> : <MoonIcon size={16} />}
        {theme === "dark" ? t("chrome.lightMode") : t("chrome.darkMode")}
      </button>

      <button
        type="button"
        className="account-panel__control account-panel__button account-panel__signout"
        onClick={() => {
          if (onDone) onDone();
          logout();
        }}
      >
        <LogOutIcon size={16} />
        {t("chrome.signOut")}
      </button>
    </div>
  );
}
