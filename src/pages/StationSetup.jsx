import { useCallback, useEffect, useState } from "react";
import { ScreenHeader } from "../components/Layout.jsx";
import { Empty, Field, Notice, Panel } from "../components/ui";
import StationFilter from "../components/StationFilter";
import {
  NozzleIcon,
  PumpIcon,
  RateIcon,
  GaugeIcon,
  TrashIcon,
} from "../components/icons";
import ResetStationSheet from "../components/ResetStationSheet.jsx";
import { useAuth } from "../state/AuthContext";
import { useStation } from "../state/useStation";
import {
  addNozzle,
  addPump,
  getPrices,
  listPumps,
  listTanks,
  mapNozzleTank,
  readableError,
  setNozzleState,
  setPumpState,
  setPrice as apiSetPrice,
} from "../lib/api";
import { activePrices } from "../lib/shiftMath";
import { fuelClass } from "../lib/fuel.js";
import { formatStamp, money, num } from "../lib/format";
import { LoadingPanels } from "../components/motion.jsx";
import { useLanguage } from "../state/LanguageContext.jsx";

const FUEL_TYPES = ["Petrol", "Diesel", "Premium Petrol", "CNG"];

export default function StationSetup() {
  const { t, tn } = useLanguage();
  const { profile } = useAuth();
  const {
    stations,
    station,
    stationId,
    setStation,
    loading: stationsLoading,
  } = useStation();

  const [pumps, setPumps] = useState([]);
  const [nozzles, setNozzles] = useState([]);
  const [tanks, setTanks] = useState([]);
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
  const [resetting, setResetting] = useState(null);

  const load = useCallback(async () => {
    if (!stationId) return;
    setLoading(true);
    try {
      const [eq, pr, stock] = await Promise.all([
        listPumps(stationId),
        getPrices(stationId),
        listTanks(stationId),
      ]);
      setPumps(eq.pumps);
      setNozzles(eq.nozzles);
      setTanks(stock.tanks.filter((tank) => tank.state !== "retired"));
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

  if (stationsLoading) {
    return (
      <>
        <ScreenHeader title={t("setup.shortTitle")} />
        <div className="content">
          <LoadingPanels count={1} lines={2} />
        </div>
      </>
    );
  }

  return (
    <>
      <ScreenHeader
        title={t("setup.title")}
        sub={
          station
            ? `${station.name} · ${tn(nozzles.length, "setup.nozzleCountOne", "setup.nozzleCount")}`
            : ""
        }
        filter={
          <StationFilter stations={stations} value={stationId} onChange={setStation} />
        }
      />
      <div className="content stack">
        {error && <Notice kind="error">{error}</Notice>}

        {/* ---------------- prices ---------------- */}
        <Panel
          title={
            <span className="row" style={{ gap: 7, alignItems: "center" }}>
              <RateIcon /> {t("setup.fuelPrices")}
            </span>
          }
          note={t("setup.pricesNote")}
        >
          {activeFuels.length === 0 ? (
            <Empty>{t("setup.addNozzleFirst")}</Empty>
          ) : (
            <>
              <div className="price-board">
                {activeFuels.map((fuel) => {
                  const rec = active[fuel];
                  const draft = rateDraft[fuel] ?? "";
                  const changed =
                    draft !== "" && num(draft) > 0 && num(draft) !== num(rec?.price);
                  return (
                    <div key={fuel} className="price-card">
                      <div className="price-card__fuel">
                        <span className={`fuel-dot fuel-dot--${fuelClass(fuel)}`} />
                        {fuel}
                      </div>
                      <div className="price-card__value">
                        {rec ? `₹ ${money(rec.price)}` : t("setup.notSet")}
                      </div>
                      <div className="price-card__since">
                        {rec
                          ? `${t("setup.activeSince")} ${formatStamp(rec.effectiveFrom)}`
                          : t("setup.cannotStart")}
                      </div>
                      <div
                        className="row"
                        style={{ gap: 6, marginTop: 10, flexWrap: "nowrap" }}
                      >
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
                          {t("setup.update")}
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
                      {t("setup.priceHistory")} ({priceRecords.length})
                    </summary>
                    <table style={{ marginTop: 10 }}>
                      <thead>
                        <tr>
                          <th>{t("shifts.fuel")}</th>
                          <th className="num">{t("shifts.price")}</th>
                          <th>{t("setup.from")}</th>
                          <th>{t("setup.to")}</th>
                          <th>{t("setup.setBy")}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {priceRecords.slice(0, 15).map((h) => (
                          <tr key={h.id}>
                            <td>
                              <span
                                className="row"
                                style={{ gap: 6, alignItems: "center" }}
                              >
                                <span
                                  className={`fuel-dot fuel-dot--${fuelClass(h.fuelType)}`}
                                />
                                {h.fuelType}
                              </span>
                            </td>
                            <td className="num mono">{money(h.price)}</td>
                            <td className="small mono">{formatStamp(h.effectiveFrom)}</td>
                            <td className="small mono">
                              {h.effectiveTo ? (
                                formatStamp(h.effectiveTo)
                              ) : (
                                <span className="tag green">{t("setup.active")}</span>
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
              <PumpIcon /> {t("setup.pumpsNozzles")}
            </span>
          }
          flush
        >
          <div className="body" style={{ borderBottom: "1px solid var(--hairline)" }}>
            <div className="row" style={{ gap: 8, alignItems: "flex-end" }}>
              <Field label={t("setup.addAPump")}>
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
                {t("setup.addPump")}
              </button>
            </div>
          </div>

          {loading ? (
            <LoadingPanels count={2} lines={3} label={t("common.loading")} />
          ) : pumps.length === 0 ? (
            <Empty>{t("setup.noPumps")}</Empty>
          ) : (
            <div>
              {pumps.map((p) => {
                const mine = nozzles.filter((n) => n.pumpId === p.id);
                return (
                  <div key={p.id} style={{ borderBottom: "1px solid var(--hairline)" }}>
                    <div
                      className="between"
                      style={{
                        padding: "10px 14px",
                        background: "var(--surface-sunken)",
                      }}
                    >
                      <span className="row" style={{ gap: 7, alignItems: "center" }}>
                        <PumpIcon size={16} />
                        <strong>{p.name}</strong>
                        <span className="tag">
                          {tn(mine.length, "setup.nozzleCountOne", "setup.nozzleCount")}
                        </span>
                      </span>
                      <span className="row" style={{ gap: 4 }}>
                        <button
                          type="button"
                          className="quiet"
                          onClick={() => {
                            setNozzleFor(nozzleFor === p.id ? null : p.id);
                            setNozzleForm({
                              name: "",
                              fuelType: "Petrol",
                              openingReading: "",
                            });
                          }}
                        >
                          {nozzleFor === p.id ? t("common.cancel") : t("setup.addNozzle")}
                        </button>
                        <button
                          type="button"
                          className="quiet"
                          onClick={() =>
                            run(() =>
                              setPumpState(
                                stationId,
                                p.id,
                                p.state === "retired" ? "active" : "retired"
                              )
                            )
                          }
                        >
                          {p.state === "retired"
                            ? t("setup.returnToService")
                            : t("setup.outOfService")}
                        </button>
                      </span>
                    </div>

                    {nozzleFor === p.id && (
                      <div
                        className="body"
                        style={{
                          background: "var(--surface-sunken)",
                          borderBottom: "1px solid var(--hairline)",
                        }}
                      >
                        <div className="form-grid" style={{ marginBottom: 10 }}>
                          <Field label={t("setup.nozzleName")}>
                            <input
                              value={nozzleForm.name}
                              onChange={(e) =>
                                setNozzleForm((f) => ({ ...f, name: e.target.value }))
                              }
                              placeholder="N3"
                            />
                          </Field>
                          <Field label={t("setup.fuelType")}>
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
                            label={t("setup.meterNow")}
                            hint={t("setup.meterNowHint")}
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
                          {t("setup.addNozzleButton")}
                        </button>
                      </div>
                    )}

                    {mine.length > 0 && (
                      <table>
                        <thead>
                          <tr>
                            <th>{t("shifts.nozzleCol")}</th>
                            <th>{t("shifts.fuel")}</th>
                            <th>{t("setup.tankCol")}</th>
                            <th className="num">{t("setup.meterReading")}</th>
                            <th className="num">{t("shifts.price")}</th>
                            <th />
                          </tr>
                        </thead>
                        <tbody>
                          {mine.map((n) => (
                            <tr key={n.id}>
                              <td>
                                <span
                                  className="row"
                                  style={{ gap: 6, alignItems: "center" }}
                                >
                                  <NozzleIcon size={15} />
                                  {n.name}
                                </span>
                              </td>
                              <td>
                                <span
                                  className="row"
                                  style={{ gap: 6, alignItems: "center" }}
                                >
                                  <span
                                    className={`fuel-dot fuel-dot--${fuelClass(n.fuelType)}`}
                                  />
                                  {n.fuelType}
                                </span>
                              </td>
                              <td>
                                {(() => {
                                  // Meter sales are posted to this tank at
                                  // shift close; an unmapped nozzle blocks
                                  // closing, so surface the gap loudly.
                                  const options = tanks.filter(
                                    (tank) =>
                                      tank.fuelType.toLowerCase() ===
                                      n.fuelType.toLowerCase()
                                  );
                                  if (options.length === 0) {
                                    return (
                                      <span className="tag rust">
                                        {t("setup.noTankForFuel")}
                                      </span>
                                    );
                                  }
                                  return (
                                    <select
                                      value={n.tankId || ""}
                                      disabled={busy}
                                      onChange={(e) =>
                                        e.target.value &&
                                        run(() =>
                                          mapNozzleTank(stationId, n.id, e.target.value)
                                        )
                                      }
                                    >
                                      {!n.tankId && (
                                        <option value="">{t("setup.pickTank")}</option>
                                      )}
                                      {options.map((tank) => (
                                        <option key={tank.id} value={tank.id}>
                                          {tank.name}
                                        </option>
                                      ))}
                                    </select>
                                  );
                                })()}
                              </td>
                              <td className="num mono">{money(n.lastReading)}</td>
                              <td className="num mono">
                                {active[n.fuelType]
                                  ? money(active[n.fuelType].price)
                                  : "—"}
                              </td>
                              <td className="num">
                                <button
                                  type="button"
                                  className="quiet"
                                  onClick={() =>
                                    run(() =>
                                      setNozzleState(
                                        stationId,
                                        n.id,
                                        n.state === "retired" ? "active" : "retired"
                                      )
                                    )
                                  }
                                >
                                  {n.state === "retired"
                                    ? t("setup.return")
                                    : t("setup.outOfService")}
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
              <GaugeIcon /> {t("setup.howReadingsFlow")}
            </span>
          }
        >
          <ul
            className="small muted"
            style={{ margin: 0, paddingLeft: 18, lineHeight: 1.75 }}
          >
            <li>
              Set each nozzle’s meter reading once, here. After that the figure advances
              automatically — every shift’s closing reading becomes the next one’s
              opening.
            </li>
            <li>
              Nobody types litres or sale amounts. Staff pick the nozzles they are taking,
              and enter only the closing reading at handover — sales are{" "}
              <span className="mono">(closing − opening) × price</span>.
            </li>
            <li>
              Change a price whenever it moves. A running shift keeps the price it started
              with, and the old price stays in history.
            </li>
          </ul>
        </Panel>

        {/* ---------------- danger zone: reset station data ---------------- */}
        <Panel
          title={
            <span
              className="row"
              style={{ gap: 7, alignItems: "center", color: "var(--rust)" }}
            >
              <TrashIcon size={16} /> {t("station.resetDangerZone")}
            </span>
          }
          note={t("station.resetDangerNote")}
        >
          <div
            className="row"
            style={{
              justifyContent: "space-between",
              alignItems: "center",
              flexWrap: "wrap",
              gap: 12,
            }}
          >
            <div>
              <div style={{ fontWeight: 500 }}>{t("station.resetData")}</div>
              <div className="small muted">{t("station.resetWarningShort")}</div>
            </div>
            <button
              type="button"
              className="danger"
              disabled={busy || !station}
              onClick={() => setResetting(station)}
            >
              {t("station.resetData")}
            </button>
          </div>
        </Panel>
      </div>

      <ResetStationSheet
        open={!!resetting}
        station={resetting}
        onClose={() => setResetting(null)}
        onDone={() => load()}
      />
    </>
  );
}
