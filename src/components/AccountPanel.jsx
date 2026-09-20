import { useAuth } from "../state/AuthContext";
import { useTheme } from "../state/ThemeContext";
import { LanguageSelect, useLanguage } from "../state/LanguageContext.jsx";
import ChangePinPanel from "./ChangePinPanel.jsx";
import { LogOutIcon, MoonIcon, StationIcon, SunIcon } from "./icons.jsx";

const ROLE_LABEL = {
  admin: "role.admin",
  owner: "role.owner",
  manager: "role.manager",
  attendant: "role.attendant",
};

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

/** Identity and device preferences, grouped into calm, independent sections. */
export default function AccountPanel({ onDone, stationName = "" }) {
  const { profile, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const { t } = useLanguage();

  return (
    <div className="account-panel">
      <section className="account-profile">
        <div className="avatar" aria-hidden="true">
          {initials(profile.name)}
        </div>
        <div className="account-profile__copy">
          <div className="account-panel__name">{profile.name}</div>
          <div className="small muted">
            {ROLE_LABEL[profile.role] ? t(ROLE_LABEL[profile.role]) : profile.role}
          </div>
          {stationName && (
            <div
              className="business-name business-name--multiline account-profile__station"
              title={stationName}
            >
              {stationName}
            </div>
          )}
        </div>
      </section>

      <section className="account-section" aria-labelledby="preferences-title">
        <h2 id="preferences-title">{t("account.preferences")}</h2>
        <div className="account-section__card">
          <LanguageSelect className="account-panel__control account-panel__language" />
          <button
            type="button"
            className="account-panel__control account-panel__button"
            onClick={toggleTheme}
          >
            {theme === "dark" ? <SunIcon size={18} /> : <MoonIcon size={18} />}
            <span>{t("account.appearance")}</span>
            <span className="account-control__value">
              {theme === "dark" ? t("chrome.darkMode") : t("chrome.lightMode")}
            </span>
          </button>
        </div>
      </section>

      {/* PIN accounts can change their own PIN; the developer signs in with a
          Supabase Auth password instead, so they get no section here. */}
      {profile.username && (
        <section className="account-section" aria-labelledby="security-title">
          <h2 id="security-title">{t("account.security")}</h2>
          <div className="account-section__card">
            <ChangePinPanel />
          </div>
        </section>
      )}

      {stationName && (
        <section className="account-section" aria-labelledby="station-title">
          <h2 id="station-title">{t("common.station")}</h2>
          <div className="account-section__card">
            <div className="account-panel__control account-panel__station-row">
              <StationIcon size={18} />
              <span className="business-name" title={stationName}>
                {stationName}
              </span>
            </div>
          </div>
        </section>
      )}

      <button
        type="button"
        className="account-panel__control account-panel__button account-panel__signout"
        onClick={() => {
          if (onDone) onDone();
          logout();
        }}
      >
        <LogOutIcon size={18} />
        {t("chrome.signOut")}
      </button>
    </div>
  );
}
