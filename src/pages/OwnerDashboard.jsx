import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { PageHeader } from "../components/Layout";
import { Empty, Field, Notice, Panel, Stat } from "../components/ui";
import { useAuth } from "../state/AuthContext";
import { useStations } from "../state/useStations";
import {
  addStation,
  listCustomers,
  listEntries,
  readableError,
} from "../lib/api";
import {
  entryCashPosition,
  entrySalesTotal,
  money,
  todayISO,
} from "../lib/format";

export default function OwnerDashboard() {
  const { profile } = useAuth();
  const { stations, loading, reload } = useStations();
  const [summaries, setSummaries] = useState({});
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ name: "", address: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  // Per-station roll-up: today's sales, today's cash, total outstanding credit.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const today = todayISO();
      const out = {};
      await Promise.all(
        stations.map(async (s) => {
          try {
            const [entries, customers] = await Promise.all([
              listEntries(s.id),
              listCustomers(s.id),
            ]);
            const todays = entries.filter((e) => e.date === today);
            out[s.id] = {
              sales: todays.reduce((n, e) => n + entrySalesTotal(e), 0),
              cash: todays.reduce((n, e) => n + entryCashPosition(e), 0),
              outstanding: customers.reduce(
                (n, c) => n + Number(c.outstandingBalance || 0),
                0
              ),
              logged: todays.length > 0,
              entryCount: entries.length,
            };
          } catch {
            out[s.id] = null;
          }
        })
      );
      if (!cancelled) setSummaries(out);
    })();
    return () => {
      cancelled = true;
    };
  }, [stations]);

  const totals = useMemo(() => {
    const vals = Object.values(summaries).filter(Boolean);
    return {
      sales: vals.reduce((n, v) => n + v.sales, 0),
      cash: vals.reduce((n, v) => n + v.cash, 0),
      outstanding: vals.reduce((n, v) => n + v.outstanding, 0),
    };
  }, [summaries]);

  const submitStation = async (e) => {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      await addStation(
        { name: form.name.trim(), address: form.address.trim() },
        profile
      );
      setForm({ name: "", address: "" });
      setShowAdd(false);
      await reload();
    } catch (err) {
      setError(readableError(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PageHeader
        title="All stations"
        sub={`${stations.length} station${stations.length === 1 ? "" : "s"} · figures for ${todayISO()}`}
      />
      <div className="content stack">
        <Panel title="Combined position today">
          <div className="row" style={{ gap: 40 }}>
            <Stat label="Fuel sales" value={`₹ ${money(totals.sales)}`} />
            <Stat
              label="Cash in hand"
              value={`₹ ${money(totals.cash)}`}
              tone={totals.cash < 0 ? "neg" : undefined}
            />
            <Stat
              label="Outstanding credit"
              value={`₹ ${money(totals.outstanding)}`}
              tone={totals.outstanding > 0 ? "neg" : "pos"}
            />
          </div>
        </Panel>

        <Panel
          title="Stations"
          flush
          actions={
            <button type="button" onClick={() => setShowAdd((v) => !v)}>
              {showAdd ? "Cancel" : "Add station"}
            </button>
          }
        >
          {showAdd && (
            <form
              className="stack"
              onSubmit={submitStation}
              style={{ padding: 14, borderBottom: "1px solid var(--hairline)" }}
            >
              <div className="form-grid">
                <Field label="Station name">
                  <input
                    value={form.name}
                    onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                    placeholder="City Centre Filling Station"
                  />
                </Field>
                <Field label="Address">
                  <input
                    value={form.address}
                    onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
                    placeholder="Beside RTO Office, Karimnagar"
                  />
                </Field>
              </div>
              {error && <Notice kind="error">{error}</Notice>}
              <div>
                <button
                  className="primary"
                  type="submit"
                  disabled={busy || !form.name.trim() || !form.address.trim()}
                >
                  {busy ? "Adding…" : "Add station"}
                </button>
              </div>
            </form>
          )}

          {loading ? (
            <Empty>Loading stations…</Empty>
          ) : stations.length === 0 ? (
            <Empty>No stations yet.</Empty>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>Station</th>
                  <th className="num">Sales today</th>
                  <th className="num">Cash position</th>
                  <th className="num">Outstanding credit</th>
                  <th>Today's log</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {stations.map((s) => {
                  const sum = summaries[s.id];
                  return (
                    <tr key={s.id}>
                      <td>
                        <div style={{ fontWeight: 500 }}>{s.name}</div>
                        <div className="small muted">{s.address}</div>
                      </td>
                      <td className="num mono">{sum ? money(sum.sales) : "—"}</td>
                      <td className="num mono">{sum ? money(sum.cash) : "—"}</td>
                      <td className="num mono">
                        {sum ? money(sum.outstanding) : "—"}
                      </td>
                      <td>
                        {!sum ? (
                          <span className="muted small">—</span>
                        ) : sum.logged ? (
                          <span className="tag green">entered</span>
                        ) : (
                          <span className="tag rust">not entered</span>
                        )}
                      </td>
                      <td className="num">
                        <Link className="small" to={`/owner/ledger?station=${s.id}`}>
                          Open ledger
                        </Link>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr>
                  <td>Total</td>
                  <td className="num mono">{money(totals.sales)}</td>
                  <td className="num mono">{money(totals.cash)}</td>
                  <td className="num mono">{money(totals.outstanding)}</td>
                  <td colSpan={2} />
                </tr>
              </tfoot>
            </table>
          )}
        </Panel>
      </div>
    </>
  );
}
