import { useState } from "react";
import { useAuth } from "../state/AuthContext";
import { backendInfo, readableError } from "../lib/api";
import { Notice } from "../components/ui";

export default function Login() {
  const { login } = useAuth();
  const [username, setUsername] = useState("");
  const [pin, setPin] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const demoLogins = backendInfo.isDemo ? backendInfo.demoLogins() : [];

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    if (!/^\d{4}$/.test(pin)) {
      setError("Enter the 4-digit PIN.");
      return;
    }
    setBusy(true);
    try {
      await login({ username: username.trim().toLowerCase(), pin });
    } catch (err) {
      setError(readableError(err));
      setPin("");
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
          <form onSubmit={submit}>
            <label className="field">
              <span>Username</span>
              <input
                className="mono"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck="false"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="ravikumar"
                autoFocus
              />
            </label>
            <label className="field">
              <span>4-digit PIN</span>
              <input
                className="pin-input"
                inputMode="numeric"
                type="password"
                maxLength={4}
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, ""))}
                placeholder="••••"
              />
            </label>
            {error && <Notice kind="error">{error}</Notice>}
            <button className="primary" type="submit" disabled={busy || !username}>
              {busy ? "Checking…" : "Sign in"}
            </button>
            <p className="small muted" style={{ margin: 0 }}>
              Accounts are issued by your station owner or the system developer. There is
              no self sign-up.
            </p>
          </form>
        </div>

        {demoLogins.length > 0 && (
          <div className="panel">
            <header>
              <h2>Demo logins</h2>
            </header>
            <div className="body" style={{ padding: 0 }}>
              <table>
                <thead>
                  <tr>
                    <th>Role</th>
                    <th>Username</th>
                    <th className="num">PIN</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {demoLogins.map((d) => (
                    <tr key={d.username}>
                      <td style={{ textTransform: "capitalize" }}>{d.role}</td>
                      <td className="mono">{d.username}</td>
                      <td className="num mono">{d.pin}</td>
                      <td className="num">
                        <button
                          type="button"
                          className="quiet"
                          onClick={() => {
                            setUsername(d.username);
                            setPin(d.pin);
                            setError("");
                          }}
                        >
                          use
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
