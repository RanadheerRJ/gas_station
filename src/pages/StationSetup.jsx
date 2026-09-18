import { Fragment, useCallback, useEffect, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { PageHeader } from "../components/Layout";
import { Empty, Field, Notice, Panel, Stat } from "../components/ui";
import StationPicker from "../components/StationPicker";
import { NozzleIcon, PumpIcon, RateIcon, GaugeIcon } from "../components/icons";
import { useAuth } from "../state/AuthContext";
import { useStations } from "../state/useStations";
import {
  addNozzle,
  addPump,
  getRates,
  listPumps,
  readableError,
  removeNozzle,
  removePump,
  setRate as apiSetRate,
} from "../lib/api";
import { formatStamp, money, num } from "../lib/format";

const FUEL_TYPES = ["Petrol", "Diesel", "Premium Petrol", "CNG"];

export default function StationSetup() {
  const { profile } = useAuth();
  const { stations, loading: stationsLoading } = useStations();
  const [params, setParams] = useSearchParams();

  const [stationId, setStationId] = useState("");
  const [pumps, setPumps] = useState([]);
  const [nozzles, setNozzles] = useState([]);
  const [rates, setRates] = useState({});
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const [pumpName, setPumpName] = useState("");
  const [nozzleFor, setNozzleFor] = useState(null);
  const [nozzleForm, setNozzleForm] = useState({
    name: "",
    fuelType: "Petrol",
    openingReading: "",
  });
  const [rateDraft, setRateDraft] = useState({});

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
      const [eq, r] = await Promise.all([listPumps(stationId), getRates(stationId)]);
      setPumps(eq.pumps);
      setNozzles(eq.nozzles);
      setRates(r.rates);
      setHistory(r.history);
      setRateDraft({});
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

  const run = async (fn) => {
    setBusy(true);
    setError("");
    try {
      await fn();
      await load();
    } catch (err) {
      setError(readableError(err));
    } finally {
      setBusy(false);
    }
  };

  // Only fuels actually dispensed here need a price.
  const activeFuels = [...new Set(nozzles.map((n) => n.fuelType))];
  const station = stations.find((s) => s.id === stationId);

  if (stationsLoading) {
    return (
      <>
        <PageHeader title="Pumps & rates" />
        <div className="content">
          <Empty>Loading…</Empty>
        </div>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Pumps, nozzles & rates"
        sub={station ? `${station.name} · ${nozzles.length} nozzle${nozzles.length === 1 ? "" : "s"}` : ""}
      />
      <div className="content stack">
        {stations.length > 1 && (
          <Panel title="Station">
            <StationPicker
              stations={stations}
              value={stationId}
              onChange={(id) => setParams({ station: id })}
            />
          </Panel>
        )}

        {error && <Notice kind="error">{error}</Notice>}

        {/* ---------------- rates ---------------- */}
        <Panel
          title={
            <span className="row" style={{ gap: 7, alignItems: "center" }}>
              <RateIcon /> Today's rates
            </span>
          }
          note="Each shift snapshots the rate in force when it opens, so changing a rate never reprices a past shift."
        >
          {activeFuels.length === 0 ? (
            <Empty>Add a nozzle first — rates are set per fuel type you dispense.</Empty>
          ) : (
            <div className="row" style={{ gap: 28, flexWrap: "wrap" }}>
              {activeFuels.map((fuel) => {
                const current = rates[fuel];
                const draft = rateDraft[fuel] ?? "";
                const changed = draft !== "" && num(draft) !== num(current);
                return (
                  <div key={fuel} className="stack" style={{ gap: 6, minWidth: 190 }}>
                    <div className="small muted">{fuel}</div>
                    <div className="row" style={{ gap: 6, flexWrap: "nowrap" }}>
                      <input
                        className="mono"
                        inputMode="decimal"
                        style={{ textAlign: "right", width: 110 }}
                        value={draft !== "" ? draft : (current ?? "")}
                        onChange={(e) =>
                          setRateDraft((d) => ({ ...d, [fuel]: e.target.value }))
                        }
                        placeholder="0.00"
                      />
                      <button
                        type="button"
                        className="small"
                        disabled={busy || !changed}
                        onClick={() =>
                          run(() =>
                            apiSetRate(stationId, { fuelType: fuel, rate: num(draft) }, profile)
                          )
                        }
                      >
                        {changed ? "Save" : "Saved"}
                      </button>
                    </div>
                    {current == null && (
                      <span className="small" style={{ color: "var(--rust)" }}>
                        No rate set — shifts cannot open.
                      </span>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {history.length > 0 && (
            <>
              <div className="divider" />
              <details>
                <summary className="small muted" style={{ cursor: "pointer" }}>
                  Rate change history ({history.length})
                </summary>
                <table style={{ marginTop: 10 }}>
                  <thead>
                    <tr>
                      <th>When</th>
                      <th>Fuel</th>
                      <th className="num">Rate</th>
                      <th>Set by</th>
                    </tr>
                  </thead>
                  <tbody>
                    {history.slice(0, 12).map((h, i) => (
                      <tr key={i}>
                        <td className="small mono">{formatStamp(h.at)}</td>
                        <td>{h.fuelType}</td>
                        <td className="num mono">{money(h.rate)}</td>
                        <td className="small">{h.setByName || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </details>
            </>
          )}
        </Panel>

        {/* ---------------- equipment ---------------- */}
        <Panel
          title={
            <span className="row" style={{ gap: 7, alignItems: "center" }}>
              <PumpIcon /> Pumps & nozzles
            </span>
          }
          flush
        >
          <div className="body" style={{ borderBottom: "1px solid var(--hairline)" }}>
            <div className="row" style={{ gap: 8, alignItems: "flex-end" }}>
              <Field label="Add a pump">
                <input
                  value={pumpName}
                  onChange={(e) => setPumpName(e.target.value)}
                  placeholder="Pump 3"
                  style={{ width: 200 }}
                />
              </Field>
              <button
                type="button"
                disabled={busy || !pumpName.trim()}
                onClick={() =>
                  run(async () => {
                    await addPump(stationId, { name: pumpName.trim() });
                    setPumpName("");
                  })
                }
              >
                Add pump
              </button>
            </div>
          </div>

          {loading ? (
            <Empty>Loading equipment…</Empty>
          ) : pumps.length === 0 ? (
            <Empty>No pumps yet. Add your first pump above.</Empty>
          ) : (
            <div>
              {pumps.map((p) => {
                const mine = nozzles.filter((n) => n.pumpId === p.id);
                return (
                  <div key={p.id} style={{ borderBottom: "1px solid var(--hairline)" }}>
                    <div
                      className="between"
                      style={{ padding: "10px 14px", background: "#fbfaf6" }}
                    >
                      <span className="row" style={{ gap: 7, alignItems: "center" }}>
                        <PumpIcon size={16} />
                        <strong>{p.name}</strong>
                        <span className="tag">{mine.length} nozzle{mine.length === 1 ? "" : "s"}</span>
                      </span>
                      <span className="row" style={{ gap: 4 }}>
                        <button
                          type="button"
                          className="quiet"
                          onClick={() => {
                            setNozzleFor(nozzleFor === p.id ? null : p.id);
                            setNozzleForm({ name: "", fuelType: "Petrol", openingReading: "" });
                          }}
                        >
                          {nozzleFor === p.id ? "cancel" : "add nozzle"}
                        </button>
                        {mine.length === 0 && (
                          <button
                            type="button"
                            className="quiet"
                            style={{ color: "var(--rust)" }}
                            onClick={() => run(() => removePump(stationId, p.id))}
                          >
                            remove
                          </button>
                        )}
                      </span>
                    </div>

                    {nozzleFor === p.id && (
                      <div
                        className="body"
                        style={{ background: "#fffdf7", borderBottom: "1px solid var(--hairline)" }}
                      >
                        <div className="form-grid" style={{ marginBottom: 10 }}>
                          <Field label="Nozzle name">
                            <input
                              value={nozzleForm.name}
                              onChange={(e) =>
                                setNozzleForm((f) => ({ ...f, name: e.target.value }))
                              }
                              placeholder="N3"
                            />
                          </Field>
                          <Field label="Fuel type">
                            <select
                              value={nozzleForm.fuelType}
                              onChange={(e) =>
                                setNozzleForm((f) => ({ ...f, fuelType: e.target.value }))
                              }
                            >
                              {FUEL_TYPES.map((f) => (
                                <option key={f} value={f}>
                                  {f}
                                </option>
                              ))}
                            </select>
                          </Field>
                          <Field
                            label="Current meter reading"
                            hint="totaliser as it reads right now"
                          >
                            <input
                              className="mono"
                              inputMode="decimal"
                              style={{ textAlign: "right" }}
                              value={nozzleForm.openingReading}
                              onChange={(e) =>
                                setNozzleForm((f) => ({
                                  ...f,
                                  openingReading: e.target.value,
                                }))
                              }
                              placeholder="0.00"
                            />
                          </Field>
                        </div>
                        <button
                          className="primary"
                          type="button"
                          disabled={busy || !nozzleForm.name.trim()}
                          onClick={() =>
                            run(async () => {
                              await addNozzle(stationId, {
                                pumpId: p.id,
                                name: nozzleForm.name.trim(),
                                fuelType: nozzleForm.fuelType,
                                openingReading: num(nozzleForm.openingReading),
                              });
                              setNozzleFor(null);
                            })
                          }
                        >
                          Add nozzle
                        </button>
                      </div>
                    )}

                    {mine.length > 0 && (
                      <table>
                        <thead>
                          <tr>
                            <th>Nozzle</th>
                            <th>Fuel</th>
                            <th className="num">Current reading</th>
                            <th className="num">Rate</th>
                            <th />
                          </tr>
                        </thead>
                        <tbody>
                          {mine.map((n) => (
                            <tr key={n.id}>
                              <td>
                                <span className="row" style={{ gap: 6, alignItems: "center" }}>
                                  <NozzleIcon size={15} />
                                  {n.name}
                                </span>
                              </td>
                              <td>{n.fuelType}</td>
                              <td className="num mono">{money(n.currentReading)}</td>
                              <td className="num mono">
                                {rates[n.fuelType] != null ? money(rates[n.fuelType]) : "—"}
                              </td>
                              <td className="num">
                                <button
                                  type="button"
                                  className="quiet"
                                  style={{ color: "var(--rust)" }}
                                  onClick={() => run(() => removeNozzle(stationId, n.id))}
                                >
                                  remove
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </Panel>

        <Panel
          title={
            <span className="row" style={{ gap: 7, alignItems: "center" }}>
              <GaugeIcon /> How readings flow
            </span>
          }
        >
          <ul className="small muted" style={{ margin: 0, paddingLeft: 18, lineHeight: 1.75 }}>
            <li>
              Set each nozzle's meter reading once, here. After that the figure advances
              automatically — every shift's closing reading becomes the next one's opening.
            </li>
            <li>
              Nobody types litres or sale amounts. Staff enter only the closing reading at
              handover, and sales are computed as{" "}
              <span className="mono">(closing − opening) × rate</span>.
            </li>
            <li>
              Change a rate whenever it moves. Open shifts keep the rate they started with.
            </li>
          </ul>
        </Panel>
      </div>
    </>
  );
}
