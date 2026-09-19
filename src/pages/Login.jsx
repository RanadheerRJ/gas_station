import { useState } from "react";
import { useAuth } from "../state/AuthContext";
import { readableError } from "../lib/api";
import { supabaseConfigured } from "../lib/supabase";
import { Notice } from "../components/ui";
import { useOneShot } from "../components/motion.jsx";
import { useTheme } from "../state/ThemeContext";
import { LanguageSelect, useLanguage } from "../state/LanguageContext.jsx";

export default function Login() {
  const { login, developerLogin } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const { t } = useLanguage();
  const [tab, setTab] = useState("staff");

  const [username, setUsername] = useState("");
  const [pin, setPin] = useState("");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  // Counts rejections so a second wrong PIN knocks the field again rather
  // than sitting there with an unchanged error message.
  const [rejections, setRejections] = useState(0);
  const shake = useOneShot(rejections, { className: "shake" });

  const switchTab = (nextTab) => {
    if (nextTab === tab) return;
    setTab(nextTab);
    setError("");
  };

  const submitStaff = async (e) => {
    e.preventDefault();
    setError("");
    if (!supabaseConfigured) {
      setError(t("login.noConfig"));
      return;
    }
    if (!/^\d{4}$/.test(pin)) {
      setError(t("login.enterPin"));
      setRejections((n) => n + 1);
      return;
    }
    setBusy(true);
    try {
      await login({ username: username.trim().toLowerCase(), pin });
    } catch (err) {
      setError(readableError(err));
      setPin("");
      setRejections((n) => n + 1);
    } finally {
      setBusy(false);
    }
  };

  const submitDeveloper = async (e) => {
    e.preventDefault();
    setError("");
    if (!supabaseConfigured) {
      setError(t("login.noConfig"));
      return;
    }
    if (!email.trim()) {
      setError(t("login.enterEmail"));
      return;
    }
    if (!password) {
      setError(t("login.enterPassword"));
      return;
    }
    setBusy(true);
    try {
      await developerLogin({ email: email.trim(), password });
    } catch (err) {
      setError(readableError(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="login-wrap">
      <div className="stack" style={{ width: 360, maxWidth: "100%" }}>
        <div className="login-card">
          <div className="head">
            <div className="brand-lockup brand-lockup--login">
              <img
                src={`${import.meta.env.BASE_URL}logo.svg`}
                alt=""
                className="brand-logo"
              />
              <div className="mark">PUMPMITHRA</div>
            </div>
            <p>{t("app.tagline")}</p>
          </div>

          <div className="login-tabs" role="tablist">
            <button
              type="button"
              role="tab"
              aria-selected={tab === "staff"}
              className={`login-tab ${tab === "staff" ? "active" : ""}`}
              onClick={() => switchTab("staff")}
            >
              {t("login.staff")}
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={tab === "developer"}
              className={`login-tab ${tab === "developer" ? "active" : ""}`}
              onClick={() => switchTab("developer")}
            >
              {t("login.developer")}
            </button>
          </div>

          {tab === "staff" ? (
            <form onSubmit={submitStaff}>
              <label className="field">
                <span>{t("login.username")}</span>
                <input
                  className="mono"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck="false"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder={t("login.usernamePlaceholder")}
                  autoFocus
                />
              </label>
              <label className="field">
                <span>{t("login.pin")}</span>
                <input
                  className={`pin-input ${shake}`.trim()}
                  inputMode="numeric"
                  type="password"
                  maxLength={4}
                  value={pin}
                  onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
                  placeholder="••••"
                  aria-invalid={error ? true : undefined}
                />
              </label>
              {!supabaseConfigured && (
                <Notice kind="error">{t("login.noProject")}</Notice>
              )}
              {error && <Notice kind="error">{error}</Notice>}
              <button
                className="primary"
                type="submit"
                disabled={busy || !username || !supabaseConfigured}
              >
                {busy ? t("login.checking") : t("login.signIn")}
              </button>
              <p className="small muted" style={{ margin: 0 }}>
                {t("login.noSelfSignup")}
              </p>
            </form>
          ) : (
            <form onSubmit={submitDeveloper}>
              <label className="field">
                <span>{t("login.developerEmail")}</span>
                <input
                  className="mono"
                  type="email"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck="false"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="developer@example.com"
                  autoFocus
                />
              </label>
              <label className="field">
                <span>{t("login.password")}</span>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  aria-invalid={error ? true : undefined}
                />
              </label>
              {!supabaseConfigured && (
                <Notice kind="error">{t("login.noProject")}</Notice>
              )}
              {error && <Notice kind="error">{error}</Notice>}
              <button
                className="primary"
                type="submit"
                disabled={busy || !email || !password || !supabaseConfigured}
              >
                {busy ? t("login.signingIn") : t("login.signInDeveloper")}
              </button>
              <p className="small muted" style={{ margin: 0 }}>
                {t("login.developerNote")}
              </p>
            </form>
          )}
          <div className="login-prefs">
            <LanguageSelect compact />
            <button type="button" className="theme-toggle" onClick={toggleTheme}>
              {theme === "dark"
                ? `☀ ${t("chrome.lightMode")}`
                : `☾ ${t("chrome.darkMode")}`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
