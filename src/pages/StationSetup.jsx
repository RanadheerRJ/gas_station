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
  getPrices,
  listPumps,
  readableError,
  removeNozzle,
  removePump,
  setPrice as apiSetPrice,
} from "../lib/api";
import { activePrices } from "../lib/shiftMath";
import { fuelClass } from "./Shifts";
import { formatStamp, money, num } from "../lib/format";

const FUEL_TYPES = ["Petrol", "Diesel", "Premium Petrol", "CNG"];

export default function StationSetup() {
  const { profile } = useAuth();
  const { stations, loading: stationsLoading } = useStations();
  const [params, setParams] = useSearchParams();

  const [stationId, setStationId] = useState("");
  const [pumps, setPumps] = useState([]);
  const [nozzles, setNozzles] = useState([]);
  const [priceRecords, setPriceRecords] = useState([]);
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
      const [eq, pr] = await Promise.all([listPumps(stationId), getPrices(stationId)]);
      setPumps(eq.pumps);
      setNozzles(eq.nozzles);
      setPriceRecords(pr);
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
  const active = activePrices(priceRecords);
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

        {/* ---------------- prices ---------------- */}
        <Panel
          title={
            <span className="row" style={{ gap: 7, alignItems: "center" }}>
              <RateIcon /> Fuel prices
            </span>
          }
          note="A new price closes the previous one and starts a fresh interval — history is never overwritten, so a past shift always reprices correctly."
        >
          {activeFuels.length === 0 ? (
            <Empty>Add a nozzle first — prices are set per fuel type you dispense.</Empty>
          ) : (
            <>
              <div className="price-board">
                {activeFuels.map((fuel) => {
                  const rec = active[fuel];
                  const draft = rateDraft[fuel] ?? "";
                  const changed = draft !== "" && num(draft) > 0 && num(draft) !== num(rec?.price);
                  return (
                    <div key={fuel} className="price-card">
                      <div className="price-card__fuel">
                        <span className={`fuel-dot fuel-dot--${fuelClass(fuel)}`} />
                        {fuel}
                      </div>
                      <div className="price-card__value">
                        {rec ? `₹ ${money(rec.price)}` : "Not set"}
                      </div>
                      <div className="price-card__since">
                        {rec ? `Active since ${formatStamp(rec.effectiveFrom)}` : "Shifts cannot start"}
                      </div>
                      <div className="row" style={{ gap: 6, marginTop: 10, flexWrap: "nowrap" }}>
                        <input
                          className="mono"
                          inputMode="decimal"
                          style={{ textAlign: "right" }}
                          value={draft}
                          onChange={(e) =>
                            setRateDraft((d) => ({ ...d, [fuel]: e.target.value }))
                          }
                          placeholder={rec ? money(rec.price) : "0.00"}
                        />
                        <button
                          type="button"
                          className="small"
                          disabled={busy || !changed}
                          onClick={() =>
                            run(async () => {
                              await apiSetPrice(
                                stationId,
                                { fuelType: fuel, price: num(draft) },
                                profile
                              );
                            })
                          }
                        >
                          Update
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>

              {priceRecords.length > 0 && (
                <>
                  <div className="divider" />
                  <details>
                    <summary className="small muted" style={{ cursor: "pointer" }}>
                      Price history ({priceRecords.length})
                    </summary>
                    <table style={{ marginTop: 10 }}>
                      <thead>
                        <tr>
                          <th>Fuel</th>
                          <th className="num">Price</th>
                          <th>From</th>
                          <th>To</th>
                          <th>Set by</th>
                        </tr>
                      </thead>
                      <tbody>
                        {priceRecords.slice(0, 15).map((h) => (
                          <tr key={h.id}>
                            <td>
                              <span className="row" style={{ gap: 6, alignItems: "center" }}>
                                <span className={`fuel-dot fuel-dot--${fuelClass(h.fuelType)}`} />
                                {h.fuelType}
                              </span>
                            </td>
                            <td className="num mono">{money(h.price)}</td>
                            <td className="small mono">{formatStamp(h.effectiveFrom)}</td>
                            <td className="small mono">
                              {h.effectiveTo ? (
                                formatStamp(h.effectiveTo)
                              ) : (
                                <span className="tag green">active</span>
                              )}
                            </td>
                            <td className="small">{h.setByName || "—"}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </details>
                </>
              )}
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
                            <th className="num">Meter reading</th>
                            <th className="num">Price</th>
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
                              <td>
                                <span className="row" style={{ gap: 6, alignItems: "center" }}>
                                  <span className={`fuel-dot fuel-dot--${fuelClass(n.fuelType)}`} />
                                  {n.fuelType}
                                </span>
                              </td>
                              <td className="num mono">{money(n.lastReading)}</td>
                              <td className="num mono">
                                {active[n.fuelType] ? money(active[n.fuelType].price) : "—"}
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
              Nobody types litres or sale amounts. Staff pick the nozzles they are
              taking, and enter only the closing reading at handover — sales are{" "}
              <span className="mono">(closing − opening) × price</span>.
            </li>
            <li>
              Change a price whenever it moves. A running shift keeps the price it
              started with, and the old price stays in history.
            </li>
          </ul>
        </Panel>
      </div>
    </>
  );
}
