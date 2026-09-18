import { Fragment, useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { PageHeader } from "../components/Layout";
import { Empty, Notice, Panel, Stat } from "../components/ui";
import StationPicker from "../components/StationPicker";
import EntryForm, { blankDraft, draftFromEntry } from "../components/EntryForm";
import { useAuth } from "../state/AuthContext";
import { useStations } from "../state/useStations";
import {
  createEntry,
  deleteEntry,
  listCustomers,
  listEntries,
  readableError,
  updateEntry,
} from "../lib/api";
import {
  entryCashPosition,
  entryCreditTotal,
  entryExpensesTotal,
  entrySalesTotal,
  formatDate,
  formatStamp,
  money,
  todayISO,
} from "../lib/format";

export default function StationLedger() {
  const { profile, canAmend } = useAuth();
  const { stations, loading: stationsLoading } = useStations();
  const [params, setParams] = useSearchParams();

  const [stationId, setStationId] = useState("");
  const [entries, setEntries] = useState([]);
  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [mode, setMode] = useState(null); // null | 'new' | entryId
  const [draft, setDraft] = useState(blankDraft());
  const [busy, setBusy] = useState(false);
  const [expanded, setExpanded] = useState(null);

  useEffect(() => {
    if (stations.length === 0) return;
    const wanted = params.get("station");
    const valid = stations.find((s) => s.id === wanted);
    setStationId(valid ? valid.id : stations[0].id);
  }, [stations, params]);

  const load = useCallback(async () => {
    if (!stationId) return;
    setLoading(true);
    try {
      const [e, c] = await Promise.all([listEntries(stationId), listCustomers(stationId)]);
      setEntries(e);
      setCustomers(c);
      setError("");
    } catch (err) {
      setError(readableError(err));
    } finally {
      setLoading(false);
    }
  }, [stationId]);

  useEffect(() => {
    load();
  }, [load]);

  const station = stations.find((s) => s.id === stationId);

  const monthTotals = useMemo(() => {
    const month = todayISO().slice(0, 7);
    const rows = entries.filter((e) => String(e.date).startsWith(month));
    return {
      sales: rows.reduce((n, e) => n + entrySalesTotal(e), 0),
      expenses: rows.reduce((n, e) => n + entryExpensesTotal(e), 0),
      credit: rows.reduce((n, e) => n + entryCreditTotal(e), 0),
      cash: rows.reduce((n, e) => n + entryCashPosition(e), 0),
      days: rows.length,
    };
  }, [entries]);

  const startNew = () => {
    setDraft(blankDraft());
    setMode("new");
  };

  const startEdit = (entry) => {
    setDraft(draftFromEntry(entry));
    setMode(entry.id);
  };

  const save = async (entry) => {
    setBusy(true);
    setError("");
    try {
      if (mode === "new") {
        await createEntry(stationId, entry, profile);
      } else {
        await updateEntry(stationId, mode, entry);
      }
      setMode(null);
      await load();
    } catch (err) {
      setError(readableError(err));
    } finally {
      setBusy(false);
    }
  };

  const remove = async (entry) => {
    if (!window.confirm(`Delete the entry for ${formatDate(entry.date)}?`)) return;
    try {
      await deleteEntry(stationId, entry.id);
      await load();
    } catch (err) {
      setError(readableError(err));
    }
  };

  if (stationsLoading) {
    return (
      <>
        <PageHeader title="Station ledger" />
        <div className="content">
          <Empty>Loading…</Empty>
        </div>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title={station ? station.name : "Station ledger"}
        sub={station?.address}
        actions={
          !mode && (
            <button className="primary" type="button" onClick={startNew}>
              New day entry
            </button>
          )
        }
      />
      <div className="content stack">
        {stations.length > 1 && (
          <Panel title="Station">
            <StationPicker
              stations={stations}
              value={stationId}
              onChange={(id) => {
                setMode(null);
                setParams({ station: id });
              }}
            />
          </Panel>
        )}

        {error && <Notice kind="error">{error}</Notice>}

        {mode ? (
          <Panel title={mode === "new" ? "New day entry" : "Correct entry"}>
            <EntryForm
              draft={draft}
              setDraft={setDraft}
              customers={customers}
              onSubmit={save}
              busy={busy}
              submitLabel={mode === "new" ? "Save entry" : "Save correction"}
              onCancel={() => setMode(null)}
            />
          </Panel>
        ) : (
          <>
            <Panel title={`This month · ${monthTotals.days} day${monthTotals.days === 1 ? "" : "s"} logged`}>
              <div className="row" style={{ gap: 40 }}>
                <Stat label="Fuel sales" value={`₹ ${money(monthTotals.sales)}`} />
                <Stat label="Expenses" value={`₹ ${money(monthTotals.expenses)}`} />
                <Stat label="On credit" value={`₹ ${money(monthTotals.credit)}`} />
                <Stat
                  label="Net cash"
                  value={`₹ ${money(monthTotals.cash)}`}
                  tone={monthTotals.cash < 0 ? "neg" : "pos"}
                />
              </div>
            </Panel>

            <Panel title="Daily register" flush>
              {loading ? (
                <Empty>Loading entries…</Empty>
              ) : entries.length === 0 ? (
                <Empty>No entries yet for this station.</Empty>
              ) : (
                <table>
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th className="num">Litres</th>
                      <th className="num">Sales</th>
                      <th className="num">Credit</th>
                      <th className="num">Expenses</th>
                      <th className="num">Cash in hand</th>
                      <th>Entered by</th>
                      <th />
                    </tr>
                  </thead>
                  <tbody>
                    {entries.map((e) => {
                      const totalLitres = Object.values(e.fuelSales || {}).reduce(
                        (n, r) => n + Number(r.litres || 0),
                        0
                      );
                      const cash = entryCashPosition(e);
                      const open = expanded === e.id;
                      return (
                        <Fragment key={e.id}>
                          <tr>
                            <td>
                              <button
                                type="button"
                                className="quiet"
                                onClick={() => setExpanded(open ? null : e.id)}
                              >
                                {formatDate(e.date)}
                              </button>
                            </td>
                            <td className="num mono">{money(totalLitres)}</td>
                            <td className="num mono">{money(entrySalesTotal(e))}</td>
                            <td className="num mono">{money(entryCreditTotal(e))}</td>
                            <td className="num mono">{money(entryExpensesTotal(e))}</td>
                            <td className={`num mono ${cash < 0 ? "v neg" : ""}`}>
                              {money(cash)}
                            </td>
                            <td className="small">
                              {e.enteredByName || "—"}
                              <div className="muted" style={{ fontSize: 11.5 }}>
                                {formatStamp(e.createdAt)}
                                {e.updatedAt ? " · corrected" : ""}
                              </div>
                            </td>
                            <td className="num">
                              {canAmend && (
                                <div className="row" style={{ gap: 4, justifyContent: "flex-end" }}>
                                  <button
                                    type="button"
                                    className="quiet"
                                    onClick={() => startEdit(e)}
                                  >
                                    edit
                                  </button>
                                  <button
                                    type="button"
                                    className="quiet"
                                    style={{ color: "var(--rust)" }}
                                    onClick={() => remove(e)}
                                  >
                                    delete
                                  </button>
                                </div>
                              )}
                            </td>
                          </tr>
                          {open && (
                            <tr>
                              <td colSpan={8} style={{ background: "#fbfaf6" }}>
                                <EntryDetail entry={e} />
                              </td>
                            </tr>
                          )}
                        </Fragment>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </Panel>
          </>
        )}
      </div>
    </>
  );
}

function EntryDetail({ entry }) {
  const fuels = Object.keys(entry.fuelSales || {});
  return (
    <div className="row" style={{ gap: 28, alignItems: "flex-start" }}>
      <div style={{ minWidth: 320, flex: 1 }}>
        <h3 style={{ marginBottom: 6 }}>Fuel &amp; tank</h3>
        <table>
          <thead>
            <tr>
              <th>Fuel</th>
              <th className="num">Litres</th>
              <th className="num">Rate</th>
              <th className="num">Amount</th>
              <th className="num">Open</th>
              <th className="num">Close</th>
            </tr>
          </thead>
          <tbody>
            {fuels.map((f) => {
              const s = entry.fuelSales[f] || {};
              const t = (entry.tankReadings || {})[f] || {};
              return (
                <tr key={f}>
                  <td>{f}</td>
                  <td className="num mono">{money(s.litres)}</td>
                  <td className="num mono">{money(s.ratePerLitre)}</td>
                  <td className="num mono">{money(s.amount)}</td>
                  <td className="num mono">{t.opening != null ? money(t.opening) : "—"}</td>
                  <td className="num mono">{t.closing != null ? money(t.closing) : "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      <div style={{ minWidth: 240, flex: 1 }}>
        <h3 style={{ marginBottom: 6 }}>Expenses</h3>
        {(entry.expenses || []).length === 0 ? (
          <div className="muted small">None</div>
        ) : (
          <table>
            <tbody>
              {entry.expenses.map((x, i) => (
                <tr key={i}>
                  <td>{x.label}</td>
                  <td className="num mono">{money(x.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        <h3 style={{ margin: "12px 0 6px" }}>Credit sales</h3>
        {(entry.creditSales || []).length === 0 ? (
          <div className="muted small">None</div>
        ) : (
          <table>
            <tbody>
              {entry.creditSales.map((c, i) => (
                <tr key={i}>
                  <td>{c.name}</td>
                  <td className="num mono">{money(c.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}

        <div className="divider" />
        <div className="row" style={{ gap: 24 }}>
          <Stat label="Cash in" value={money(entry.cashIn)} />
          <Stat label="Cash out" value={money(entry.cashOut)} />
        </div>
      </div>
    </div>
  );
}
