import { useRef, useState } from "react";
import { useAuth } from "../state/AuthContext";
import { readableError } from "../lib/api";
import { supabaseConfigured } from "../lib/supabase";
import { Notice, Segmented } from "../components/ui";
import { useOneShot } from "../components/motion.jsx";
import { PetravMark, PetravWordmark } from "../components/branding.jsx";
import StickyCta from "../components/StickyCta.jsx";
import { Chip } from "../components/Chip.jsx";
import OverflowMenu from "../components/OverflowMenu.jsx";
import {
  AlertIcon,
  EyeIcon,
  EyeOffIcon,
  MoonIcon,
  RefreshIcon,
  SunIcon,
} from "../components/icons.jsx";
import { hardRefreshApp } from "../lib/pwa.js";
import { useTheme } from "../state/ThemeContext";
import { useLanguage } from "../state/LanguageContext.jsx";

/**
 * The PIN as four separate digit boxes: auto-advance on type, backspace
 * moves to the previous box, and a paste of the whole code fills whatever is
 * left of it. Controlled entirely through the parent's `value`, so login
 * state stays where it is.
 */
function PinBoxes({ value, onChange, visible, invalid, shakeClass }) {
  const { t } = useLanguage();
  const refs = [useRef(), useRef(), useRef(), useRef()];

  const focusAt = (index) => {
    const clamp = Math.max(0, Math.min(index, 3));
    refs[clamp].current?.focus();
    refs[clamp].current?.select();
  };

  const handleBox = (index, raw) => {
    const digits = raw.replace(/\D/g, "");
    if (!digits) {
      // A deletion: clear this box and stay put.
      const next = value.split("");
      next[index] = "";
      onChange(next.join("").replace(/\s/g, ""));
      return;
    }
    if (digits.length > 1) {
      // Fast typing or a paste: fill from this box onwards.
      const next = value.split("");
      for (let i = 0; i < 4 - index && i < digits.length; i += 1) {
        next[index + i] = digits[i];
      }
      onChange(next.join("").replace(/\s/g, ""));
      focusAt(index + digits.length - 1);
      return;
    }
    const next = value.split("");
    next[index] = digits;
    onChange(next.join("").replace(/\s/g, ""));
    if (index < 3) focusAt(index + 1);
  };

  const handleKey = (index, event) => {
    if (event.key === "Backspace" && !value[index] && index > 0) {
      event.preventDefault();
      const next = value.split("");
      next[index - 1] = "";
      onChange(next.join(""));
      focusAt(index - 1);
    }
  };

  return (
    <div
      className={`pin-boxes${shakeClass ? ` ${shakeClass}` : ""}${invalid ? " pin-boxes--invalid" : ""}`}
    >
      {[0, 1, 2, 3].map((index) => (
        <input
          key={index}
          ref={refs[index]}
          className="pin-box mono"
          type={visible ? "text" : "password"}
          inputMode="numeric"
          autoComplete="off"
          maxLength={4}
          value={value[index] ?? ""}
          aria-label={t("login.pinDigit", { index: index + 1 })}
          aria-invalid={invalid || undefined}
          onChange={(e) => handleBox(index, e.target.value)}
          onKeyDown={(e) => handleKey(index, e)}
          onFocus={(e) => e.target.select()}
        />
      ))}
    </div>
  );
}

/** A large input with a label that floats up once there is something to see. */
function FloatField({ label, children }) {
  return (
    <label className="login-field">
      {children}
      <span className="login-field__label">{label}</span>
    </label>
  );
}

export default function Login() {
  const { login, developerLogin } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const { t, language, setLanguage, languages, languageNames } = useLanguage();
  const [tab, setTab] = useState("staff");

  const [username, setUsername] = useState("");
  const [pin, setPin] = useState("");
  const [pinVisible, setPinVisible] = useState(false);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const [busy, setBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
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

  const submitStaff = async () => {
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

  const submitDeveloper = async () => {
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

  // The pill is disabled with a reason until the form can actually sign in.
  const staffValid = Boolean(username.trim()) && /^\d{4}$/.test(pin);
  const developerValid = Boolean(email.trim()) && Boolean(password);
  const formValid = tab === "staff" ? staffValid : developerValid;
  const missingReason = !supabaseConfigured
    ? t("login.noConfig")
    : tab === "staff"
      ? !username.trim()
        ? t("login.needUsername")
        : !/^\d{4}$/.test(pin)
          ? t("login.enterPin")
          : ""
      : !email.trim()
        ? t("login.enterEmail")
        : !password
          ? t("login.enterPassword")
          : "";

  const submit = tab === "staff" ? submitStaff : submitDeveloper;

  return (
    <div className="login">
      {/* The brand moment: a soft accent-tinted header with a rounded bottom
          edge, the mark large and centred, one line of welcome. Theme is an
          icon button here; the support-only hard refresh stays in a menu. */}
      <div className="login__hero">
        <div className="login__tools">
          <button
            type="button"
            className="login__tool"
            onClick={toggleTheme}
            aria-label={theme === "dark" ? t("chrome.lightMode") : t("chrome.darkMode")}
          >
            {theme === "dark" ? <SunIcon size={18} /> : <MoonIcon size={18} />}
          </button>
          <OverflowMenu
            placement="up"
            items={[
              {
                key: "refresh",
                label: refreshing ? t("chrome.refreshing") : t("chrome.hardRefresh"),
                icon: <RefreshIcon size={16} />,
                disabled: refreshing,
                onClick: async () => {
                  setRefreshing(true);
                  await hardRefreshApp();
                },
              },
            ]}
          />
        </div>
        <div className="login__hero-inner">
          <PetravMark size={72} label="PÉTRAV" />
          <PetravWordmark height={30} />
          <p className="login__welcome">{t("login.welcome")}</p>
        </div>
      </div>

      <div className="login__body">
        <div className="login__card">
          <Segmented
            value={tab}
            onChange={switchTab}
            options={[
              { value: "staff", label: t("login.staff") },
              { value: "developer", label: t("login.developer") },
            ]}
          />

          {tab === "staff" ? (
            <form
              className="login__form"
              onSubmit={(e) => {
                e.preventDefault();
                submit();
              }}
            >
              <FloatField label={t("login.username")}>
                <input
                  className="mono"
                  autoCapitalize="none"
                  autoCorrect="off"
                  autoComplete="username"
                  spellCheck="false"
                  value={username}
                  onChange={(e) => setUsername(e.target.value)}
                  placeholder=" "
                  autoFocus
                />
              </FloatField>

              <div className="login-pin">
                <div className="login-pin__head">
                  <span className="login-pin__label">{t("login.pin")}</span>
                  <button
                    type="button"
                    className="login-pin__reveal"
                    onClick={() => setPinVisible((v) => !v)}
                    aria-label={pinVisible ? t("cred.hide") : t("cred.show")}
                    aria-pressed={pinVisible}
                  >
                    {pinVisible ? <EyeOffIcon size={17} /> : <EyeIcon size={17} />}
                  </button>
                </div>
                <PinBoxes
                  value={pin}
                  onChange={setPin}
                  visible={pinVisible}
                  invalid={Boolean(error)}
                  shakeClass={shake}
                />
              </div>

              {!supabaseConfigured && (
                <Notice kind="error">{t("login.noProject")}</Notice>
              )}
              {error && (
                <p className="login-error" role="alert">
                  <AlertIcon size={15} />
                  {error}
                </p>
              )}

              <p className="small muted login__note">{t("login.forgotPin")}</p>
            </form>
          ) : (
            <form
              className="login__form"
              onSubmit={(e) => {
                e.preventDefault();
                submit();
              }}
            >
              <FloatField label={t("login.developerEmail")}>
                <input
                  type="email"
                  autoCapitalize="none"
                  autoCorrect="off"
                  spellCheck="false"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder=" "
                  autoFocus
                />
              </FloatField>

              <FloatField label={t("login.password")}>
                <input
                  type="password"
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder=" "
                  aria-invalid={error ? true : undefined}
                />
              </FloatField>

              {!supabaseConfigured && (
                <Notice kind="error">{t("login.noProject")}</Notice>
              )}
              {error && (
                <p className="login-error" role="alert">
                  <AlertIcon size={15} />
                  {error}
                </p>
              )}

              <p className="small muted login__note">{t("login.developerNote")}</p>
            </form>
          )}

          {/* Language as three tappable pills: each named in its own script,
              so nobody has to read English to switch. */}
          <div className="login-lang" role="group" aria-label={t("chrome.language")}>
            {languages.map((code) => (
              <Chip
                key={code}
                label={languageNames[code]}
                selected={language === code}
                onClick={() => setLanguage(code)}
              />
            ))}
          </div>

          <p className="small muted login__note">{t("login.noSelfSignup")}</p>
        </div>
      </div>

      {/* The one action, pinned where the keyboard cannot eat it. */}
      <StickyCta
        summary={tab === "staff" ? t("login.staff") : t("login.developer")}
        hint={missingReason}
        ctaLabel={busy ? t("login.checking") : t("login.signIn")}
        onCta={submit}
        disabled={!formValid || !supabaseConfigured}
        busy={busy}
      />
    </div>
  );
}
