import { useEffect, useState } from "react";
import { PageHeader } from "../components/Layout";
import { CredentialPanel, Field, Notice, Panel } from "../components/ui";
import { createOwner, readableError } from "../lib/api";

const BLANK = { ownerName: "", stationName: "", phone: "", address: "" };

export default function AdminInviteOwner() {
  const [form, setForm] = useState(BLANK);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [credentials, setCredentials] = useState(null);

  // Credentials live in component state only — leaving the page loses them,
  // which is the intent: the raw PIN is never recoverable.
  useEffect(() => () => setCredentials(null), []);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    setCredentials(null);
    setBusy(true);
    try {
      const res = await createOwner({
        ownerName: form.ownerName.trim(),
        stationName: form.stationName.trim(),
        phone: form.phone.trim(),
        address: form.address.trim(),
      });
      setCredentials({ ...res, subject: form.ownerName.trim() });
      setForm(BLANK);
    } catch (err) {
      setError(readableError(err));
    } finally {
      setBusy(false);
    }
  };

  const complete =
    form.ownerName.trim() && form.stationName.trim() && form.phone.trim() && form.address.trim();

  return (
    <>
      <PageHeader
        title="Invite a station owner"
        sub="Developer console · creates the owner account and their first station"
      />
      <div className="content stack" style={{ maxWidth: 780 }}>
        {credentials && (
          <Panel title="New owner credentials">
            <CredentialPanel
              username={credentials.username}
              pin={credentials.pin}
              subject={credentials.subject}
              onDismiss={() => setCredentials(null)}
            />
          </Panel>
        )}

        <Panel
          title="Owner details"
          note="The account is created server-side; a username and PIN are generated for you."
        >
          <form className="stack" onSubmit={submit}>
            <div className="form-grid">
              <Field label="Owner name">
                <input value={form.ownerName} onChange={set("ownerName")} placeholder="Ravi Kumar" />
              </Field>
              <Field label="Phone number">
                <input
                  className="mono"
                  inputMode="tel"
                  value={form.phone}
                  onChange={set("phone")}
                  placeholder="+91 98480 11223"
                />
              </Field>
              <Field label="Station name">
                <input
                  value={form.stationName}
                  onChange={set("stationName")}
                  placeholder="Highway 44 Fuel Point"
                />
              </Field>
              <Field label="Station address">
                <input
                  value={form.address}
                  onChange={set("address")}
                  placeholder="NH-44, Shamirpet, Hyderabad"
                />
              </Field>
            </div>

            {error && <Notice kind="error">{error}</Notice>}

            <div className="row">
              <button className="primary" type="submit" disabled={busy || !complete}>
                {busy ? "Creating account…" : "Create owner account"}
              </button>
            </div>
          </form>
        </Panel>

        <Panel title="How this works">
          <ul className="small muted" style={{ margin: 0, paddingLeft: 18, lineHeight: 1.7 }}>
            <li>
              The owner account is created by the <span className="mono">createOwner</span> Cloud
              Function using the Admin SDK. Nothing is written from this browser.
            </li>
            <li>
              The PIN is hashed with bcrypt into{" "}
              <span className="mono">authSecrets/&#123;uid&#125;</span>, a collection no client can
              read or write.
            </li>
            <li>
              Owners create their own managers and attendants from their dashboard — you never
              need to issue staff logins.
            </li>
          </ul>
        </Panel>
      </div>
    </>
  );
}
