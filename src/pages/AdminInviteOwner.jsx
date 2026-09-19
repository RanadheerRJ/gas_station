import { Fragment, useCallback, useEffect, useState } from "react";
import { PageHeader } from "../components/Layout";
import { CredentialPanel, Empty, Field, Notice, Panel } from "../components/ui";
import PinField, { pinReady } from "../components/PinField";
import ResetPinPanel from "../components/ResetPinPanel";
import { createOwner, listOwners, readableError } from "../lib/api";
import { LoadingPanels } from "../components/motion.jsx";

const BLANK = {
  ownerName: "",
  stationName: "",
  phone: "",
  address: "",
  pin: "",
  confirmPin: "",
};

export default function AdminInviteOwner() {
  const [form, setForm] = useState(BLANK);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [credentials, setCredentials] = useState(null);
  const [owners, setOwners] = useState([]);
  const [loadingOwners, setLoadingOwners] = useState(true);
  const [resetting, setResetting] = useState(null);

  const loadOwners = useCallback(async () => {
    setLoadingOwners(true);
    try {
      setOwners(await listOwners());
    } catch {
      setOwners([]);
    } finally {
      setLoadingOwners(false);
    }
  }, []);

  useEffect(() => {
    loadOwners();
  }, [loadOwners]);

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
        pin: form.pin,
      });
      setCredentials({ ...res, pin: form.pin, subject: form.ownerName.trim() });
      setForm(BLANK);
      await loadOwners();
    } catch (err) {
      setError(readableError(err));
    } finally {
      setBusy(false);
    }
  };

  const complete =
    form.ownerName.trim() &&
    form.stationName.trim() &&
    form.phone.trim() &&
    form.address.trim() &&
    pinReady(form.pin, form.confirmPin);

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
          note="The account is created server-side. You choose the PIN; the username is generated from the name."
        >
          <form className="stack" onSubmit={submit}>
            <div className="form-grid">
              <Field label="Owner name">
                <input
                  value={form.ownerName}
                  onChange={set("ownerName")}
                  placeholder="Ravi Kumar"
                />
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
              <PinField
                pin={form.pin}
                confirm={form.confirmPin}
                onPin={(v) => setForm((f) => ({ ...f, pin: v }))}
                onConfirm={(v) => setForm((f) => ({ ...f, confirmPin: v }))}
                label="PIN for this owner"
              />
            </div>

            {error && <Notice kind="error">{error}</Notice>}

            <div className="row">
              <button className="primary" type="submit" disabled={busy || !complete}>
                {busy ? "Creating account…" : "Create owner account"}
              </button>
            </div>
          </form>
        </Panel>

        <Panel title="Owner accounts" flush>
          {loadingOwners ? (
            <LoadingPanels count={2} lines={2} label="Loading owners" />
          ) : owners.length === 0 ? (
            <Empty>No owners yet.</Empty>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Owner</th>
                  <th>Username</th>
                  <th>Phone</th>
                  <th className="num">Stations</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {owners.map((o) => (
                  <Fragment key={o.uid}>
                    <tr>
                      <td style={{ fontWeight: 500 }}>{o.name}</td>
                      <td className="mono">{o.username}</td>
                      <td className="mono small">{o.phone}</td>
                      <td className="num mono">{(o.stationIds || []).length}</td>
                      <td className="num">
                        <button
                          type="button"
                          className="quiet"
                          onClick={() => setResetting(resetting === o.uid ? null : o.uid)}
                        >
                          {resetting === o.uid ? "cancel" : "reset PIN"}
                        </button>
                      </td>
                    </tr>
                    {resetting === o.uid && (
                      <tr>
                        <td colSpan={5} style={{ background: "var(--surface-sunken)" }}>
                          <ResetPinPanel target={o} onDone={() => setResetting(null)} />
                        </td>
                      </tr>
                    )}
                  </Fragment>
                ))}
              </tbody>
            </table>
          )}
        </Panel>

        <Panel title="How this works">
          <ul
            className="small muted"
            style={{ margin: 0, paddingLeft: 18, lineHeight: 1.7 }}
          >
            <li>
              The owner account is created by the <span className="mono">accounts</span>{" "}
              Supabase Edge Function. Its service key never reaches this browser.
            </li>
            <li>
              Supabase Auth stores a hash of the derived username + PIN password. The
              public database never stores a raw PIN or a PIN hash.
            </li>
            <li>
              You choose the owner’s opening PIN and hand it over. Only its hash is kept,
              so it cannot be read back — use <em>Reset PIN</em> below if it is ever lost.
            </li>
            <li>
              Owners create their own managers and attendants from their dashboard — you
              never need to issue staff logins.
            </li>
          </ul>
        </Panel>
      </div>
    </>
  );
}
