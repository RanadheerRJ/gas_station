import { useCallback, useEffect, useState } from "react";
import { PageHeader } from "../components/Layout";
import { CredentialPanel, Empty, Field, Notice, Panel } from "../components/ui";
import { useAuth } from "../state/AuthContext";
import { useStations } from "../state/useStations";
import { createStaff, listStaff, readableError } from "../lib/api";
import { formatStamp } from "../lib/format";

export default function OwnerStaff() {
  const { profile } = useAuth();
  const { stations } = useStations();
  const [staff, setStaff] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState({ name: "", phone: "", stationId: "", role: "attendant" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [credentials, setCredentials] = useState(null);

  const load = useCallback(async () => {
    if (!profile) return;
    setLoading(true);
    try {
      setStaff(await listStaff(profile));
    } catch (err) {
      setError(readableError(err));
    } finally {
      setLoading(false);
    }
  }, [profile]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (stations.length && !form.stationId) {
      setForm((f) => ({ ...f, stationId: stations[0].id }));
    }
  }, [stations, form.stationId]);

  const stationName = (id) => stations.find((s) => s.id === id)?.name || "—";

  const submit = async (e) => {
    e.preventDefault();
    setError("");
    setCredentials(null);
    setBusy(true);
    try {
      const res = await createStaff(
        {
          name: form.name.trim(),
          phone: form.phone.trim(),
          stationId: form.stationId,
          role: form.role,
        },
        profile
      );
      setCredentials({ ...res, subject: form.name.trim() });
      setForm((f) => ({ ...f, name: "", phone: "" }));
      await load();
    } catch (err) {
      setError(readableError(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PageHeader title="Staff & access" sub="Managers and attendants you have issued logins to" />
      <div className="content stack">
        {credentials && (
          <Panel title="New staff credentials">
            <CredentialPanel
              username={credentials.username}
              pin={credentials.pin}
              subject={credentials.subject}
              onDismiss={() => setCredentials(null)}
            />
          </Panel>
        )}

        <Panel
          title="Invite a manager or attendant"
          note="Managers can correct past entries; attendants can only log the day."
        >
          <form className="stack" onSubmit={submit}>
            <div className="form-grid">
              <Field label="Name">
                <input
                  value={form.name}
                  onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                  placeholder="Suresh Babu"
                />
              </Field>
              <Field label="Phone">
                <input
                  className="mono"
                  inputMode="tel"
                  value={form.phone}
                  onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
                  placeholder="+91 98765 44556"
                />
              </Field>
              <Field label="Station">
                <select
                  value={form.stationId}
                  onChange={(e) => setForm((f) => ({ ...f, stationId: e.target.value }))}
                >
                  {stations.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Role">
                <select
                  value={form.role}
                  onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))}
                >
                  <option value="attendant">Attendant</option>
                  <option value="manager">Manager</option>
                </select>
              </Field>
            </div>
            {error && <Notice kind="error">{error}</Notice>}
            <div>
              <button
                className="primary"
                type="submit"
                disabled={busy || !form.name.trim() || !form.phone.trim() || !form.stationId}
              >
                {busy ? "Creating…" : "Create login"}
              </button>
            </div>
          </form>
        </Panel>

        <Panel title="Existing staff" flush>
          {loading ? (
            <Empty>Loading…</Empty>
          ) : staff.length === 0 ? (
            <Empty>You haven't issued any staff logins yet.</Empty>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Username</th>
                  <th>Phone</th>
                  <th>Role</th>
                  <th>Station</th>
                  <th>Created</th>
                </tr>
              </thead>
              <tbody>
                {staff.map((s) => (
                  <tr key={s.uid}>
                    <td style={{ fontWeight: 500 }}>{s.name}</td>
                    <td className="mono">{s.username}</td>
                    <td className="mono small">{s.phone}</td>
                    <td style={{ textTransform: "capitalize" }}>{s.role}</td>
                    <td>{stationName((s.stationIds || [])[0])}</td>
                    <td className="small muted">{formatStamp(s.createdAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Panel>
      </div>
    </>
  );
}
