import { useState } from "react";
import { useAuth } from "../state/AuthContext";
import { readableError } from "../lib/api";
import { supabaseConfigured } from "../lib/supabase";
import { Notice } from "../components/ui";
import { useOneShot } from "../components/motion.jsx";
import { useTheme } from "../state/ThemeContext";

export default function Login() {
  const { login, developerLogin } = useAuth();
  const { theme, toggleTheme } = useTheme();
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
      setError("This build has no Supabase configuration. See the README.");
      return;
    }
    if (!/^\d{4}$/.test(pin)) {
      setError("Enter the 4-digit PIN.");
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
      setError("This build has no Supabase configuration. See the README.");
      return;
    }
    if (!email.trim()) {
      setError("Enter your developer email.");
      return;
    }
    if (!password) {
      setError("Enter your password.");
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
            <div className="mark">STATION LEDGER</div>
            <p>Daily operations and accounts for fuel stations</p>
          </div>

          <div className="login-tabs" role="tablist">
            <button
              type="button"
              role="tab"
              aria-selected={tab === "staff"}
              className={`login-tab ${tab === "staff" ? "active" : ""}`}
              onClick={() => switchTab("staff")}
            >
              Staff
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={tab === "developer"}
              className={`login-tab ${tab === "developer" ? "active" : ""}`}
              onClick={() => switchTab("developer")}
            >
              Developer
            </button>
          </div>

          {tab === "staff" ? (
            <form onSubmit={submitStaff}>
              <label className="field">
                <span>Username</span>
                <input
                  className="mono"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck="false"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder="your username"
                  autoFocus
                />
              </label>
              <label className="field">
                <span>4-digit PIN</span>
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
                <Notice kind="error">
                  No Supabase project is configured, so sign-in cannot work. Copy{" "}
                  <span className="mono">.env.example</span> to{" "}
                  <span className="mono">.env.local</span>, fill in the{" "}
                  <span className="mono">
                    VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY
                  </span>{" "}
                  values from your project settings, and restart the dev server.
                </Notice>
              )}
              {error && <Notice kind="error">{error}</Notice>}
              <button
                className="primary"
                type="submit"
                disabled={busy || !username || !supabaseConfigured}
              >
                {busy ? "Checking…" : "Sign in"}
              </button>
              <p className="small muted" style={{ margin: 0 }}>
                Accounts are issued by your station owner or the system developer. There
                is no self sign-up.
              </p>
            </form>
          ) : (
            <form onSubmit={submitDeveloper}>
              <label className="field">
                <span>Developer email</span>
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
                <span>Password</span>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  aria-invalid={error ? true : undefined}
                />
              </label>
              {!supabaseConfigured && (
                <Notice kind="error">
                  No Supabase project is configured, so sign-in cannot work. Copy{" "}
                  <span className="mono">.env.example</span> to{" "}
                  <span className="mono">.env.local</span>, fill in the{" "}
                  <span className="mono">
                    VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY
                  </span>{" "}
                  values from your project settings, and restart the dev server.
                </Notice>
              )}
              {error && <Notice kind="error">{error}</Notice>}
              <button
                className="primary"
                type="submit"
                disabled={busy || !email || !password || !supabaseConfigured}
              >
                {busy ? "Signing in…" : "Sign in as developer"}
              </button>
              <p className="small muted" style={{ margin: 0 }}>
                Developer accounts are created in Supabase Auth, then assigned the
                <span className="mono">admin</span> profile role as described in the
                README.
              </p>
            </form>
          )}
          <button
            type="button"
            className="theme-toggle"
            onClick={toggleTheme}
            aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} theme`}
          >
            {theme === "dark" ? "☀ Light mode" : "☾ Dark mode"}
          </button>
        </div>
      </div>
    </div>
  );
}
