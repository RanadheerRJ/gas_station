import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { PageHeader } from "../components/Layout";
import { Empty, Field, Notice, Panel, Stat } from "../components/ui";
import StationPicker from "../components/StationPicker";
import { GaugeIcon, TankIcon } from "../components/icons";
import { useAuth } from "../state/AuthContext";
import { useStations } from "../state/useStations";
import {
  addTank,
  listTanks,
  readableError,
  recordDelivery,
  recordDip,
  setTankState,
} from "../lib/api";
import { formatStamp, money, num } from "../lib/format";
import {
  REFERENCE_TEMP_C,
  TEMP_RANGE,
  WATER_LIMIT_CM,
  stockByProduct,
  tankStatus,
  validateDip,
} from "../lib/tankMath";
import { fuelClass } from "./Shifts";
import { LoadingPanels, NumberRoll, useAnimatedList } from "../components/motion.jsx";
import ReportTools from "../components/ReportTools.jsx";
import { defaultRange, filterByRange, stockReport } from "../lib/export.js";
import { useLanguage } from "../state/LanguageContext.jsx";

const FUEL_TYPES = ["Petrol", "Diesel", "Premium Petrol", "CNG"];

/**
 * An underground tank drawn side-on: straight barrel, dished ends, fuel
 * lying flat at its level. The level animates in on first paint and between
 * dips, so a change in stock is something you see happen.
 */
function TankVessel({ tank }) {
  const st = tankStatus(tank);
  const cls = fuelClass(tank.fuelType);

  // Fill from empty on first paint so the level reads as a measurement
  // arriving, then animate between levels as dips come in.
  const [shown, setShown] = useState(0);
  useEffect(() => {
    const id = requestAnimationFrame(() => setShown(st.fillPercent));
    return () => cancelAnimationFrame(id);
  }, [st.fillPercent]);

  return (
    <div
      className={`tank-vessel ${st.level}${st.retired ? " retired" : ""}`}
      title={`${money(st.stock)} L of ${money(st.capacity)} L`}
    >
      <div
        className={`tank-vessel__fill tank-fill--${cls}`}
        style={{ height: `${shown}%` }}
      >
        <div className="tank-vessel__surface" />
      </div>
      <div className="tank-vessel__ticks">
        {[25, 50, 75].map((t) => (
          <i key={t} style={{ bottom: `${t}%` }} />
        ))}
      </div>
      <div className="tank-vessel__pct">{Math.round(st.fillPercent)}%</div>
    </div>
  );
}

export default function GroundStock() {
  const { t, tn } = useLanguage();
  const { profile } = useAuth();
  const { stations, loading: stationsLoading } = useStations();
  const [params, setParams] = useSearchParams();

  const [stationId, setStationId] = useState("");
  const [tanks, setTanks] = useState([]);
  const [dips, setDips] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState(null);
  const [mode, setMode] = useState("dip");
  const [showAdd, setShowAdd] = useState(false);
  const [range, setRange] = useState(() => defaultRange());

  const isOwner = profile.role === "owner";

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
      const { tanks: t, dips: d } = await listTanks(stationId);
      setTanks(t);
      setDips(d);
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
      return true;
    } catch (err) {
      setError(readableError(err));
      return false;
    } finally {
      setBusy(false);
    }
  };

  const active = useMemo(() => tanks.filter((t) => t.state !== "retired"), [tanks]);

  // Retiring a tank removes it from this list; hold it for one beat so the
  // card collapses instead of disappearing between renders.
  const tankRows = useAnimatedList(active);
  const byProduct = useMemo(() => stockByProduct(active), [active]);
  const station = stations.find((s) => s.id === stationId);
  const selectedTank = tanks.find((t) => t.id === selected) || null;

  const totals = useMemo(() => {
    const s = active.map(tankStatus);
    return {
      stock: s.reduce((n, x) => n + x.stock, 0),
      capacity: s.reduce((n, x) => n + x.capacity, 0),
      ullage: s.reduce((n, x) => n + x.ullage, 0),
      low: s.filter((x) => x.level === "low" || x.level === "dry").length,
    };
  }, [active]);

  // Tanks needing water attention are worth surfacing without hunting.
  const wet = active.filter((tank) => num(tank.waterCm) > WATER_LIMIT_CM);

  // The dip log and its exports read the same filtered list, so a download
  // never contains a reading the log is not showing.
  const visibleDips = useMemo(
    () => filterByRange(dips, range, (d) => d.recordedAt),
    [dips, range]
  );

  if (stationsLoading) {
    return (
      <>
        <PageHeader title={t("stock.title")} />
        <div className="content">
          <LoadingPanels count={1} lines={2} />
        </div>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title={t("stock.title")}
        sub={
          station
            ? `${station.name} · ${tn(tanks.length, "stock.tank", "stock.tanks")}`
            : ""
        }
        actions={
          isOwner && (
            <button type="button" onClick={() => setShowAdd((v) => !v)}>
              {showAdd ? t("common.cancel") : t("stock.addTank")}
            </button>
          )
        }
      />
      <div className="content stack">
        {stations.length > 1 && (
          <Panel title={t("common.station")}>
            <StationPicker
              stations={stations}
              value={stationId}
              onChange={(id) => setParams({ station: id })}
            />
          </Panel>
        )}

        {error && <Notice kind="error">{error}</Notice>}

        {totals.low > 0 && (
          <Notice kind="error">
            {tn(totals.low, "stock.lowWarningOne", "stock.lowWarning")}
          </Notice>
        )}

        {wet.length > 0 && (
          <Notice kind="error">
            {t("stock.waterWarning", {
              limit: WATER_LIMIT_CM,
              tanks: wet.map((tank) => tank.name).join(", "),
            })}
          </Notice>
        )}

        {showAdd && isOwner && (
          <AddTankForm
            busy={busy}
            existing={tanks.length}
            onCancel={() => setShowAdd(false)}
            onSubmit={async (form) => {
              const ok = await run(() => addTank(stationId, form));
              if (ok) setShowAdd(false);
            }}
          />
        )}

        <Panel title={t("report.title")} note={t("report.note")}>
          <ReportTools
            report="stock"
            title="Ground stock"
            stationName={station?.name || ""}
            range={range}
            onRangeChange={setRange}
            rowCount={
              stockReport({ tanks: active, entries: dips, range, stationName: "" }).rows
                .length
            }
            buildReport={() =>
              stockReport({
                tanks: active,
                entries: dips,
                range,
                stationName: station?.name || "",
              })
            }
          />
        </Panel>

        <Panel title={t("stock.tanksTitle")} note={t("stock.tanksNote")}>
          {loading ? (
            <LoadingPanels count={2} lines={3} label={t("common.loading")} />
          ) : tanks.length === 0 ? (
            <Empty>
              {t("stock.noTanks")}{" "}
              {isOwner ? t("stock.noTanksOwner") : t("stock.noTanksStaff")}
            </Empty>
          ) : (
            <>
              <div className="tank-farm">
                {tankRows.map(({ item: tank, exiting }) => {
                  const st = tankStatus(tank);
                  const warm = num(tank.temperatureC) > 35;
                  return (
                    <div
                      key={tank.id}
                      className={`tank-card${selected === tank.id ? " selected" : ""} ${
                        exiting ? "row-exit" : "row-enter"
                      }`}
                      onClick={() => {
                        setSelected(selected === tank.id ? null : t.id);
                        setMode("dip");
                      }}
                      style={{ cursor: "pointer" }}
                    >
                      <TankVessel tank={tank} />
                      <div className="tank-card__body">
                        <div className="tank-card__name">
                          <span
                            className={`fuel-dot fuel-dot--${fuelClass(tank.fuelType)}`}
                          />
                          {tank.name}
                        </div>
                        <div className="tank-card__fuel">{tank.fuelType}</div>

                        <div className="tank-card__figure">
                          {/* Stock changes when a dip or delivery is recorded;
                              counting makes the direction of the change plain. */}
                          <NumberRoll value={st.stock} format={money} /> <span>L</span>
                          <div className="tank-card__fuel">
                            {t("stock.of")} {money(st.capacity)} L · {money(st.ullage)}{" "}
                            {t("stock.spaceFor")}
                          </div>
                        </div>

                        <div className="tank-card__meta">
                          {tank.temperatureC == null ? (
                            <span className="muted">{t("stock.noTemperature")}</span>
                          ) : (
                            <span className={`temp-chip${warm ? " warm" : ""}`}>
                              {num(tank.temperatureC).toFixed(1)} °C
                            </span>
                          )}
                          {st.volumeAt15 != null && (
                            <div>
                              {money(st.volumeAt15)} L {t("stock.at")} {REFERENCE_TEMP_C}{" "}
                              °C
                            </div>
                          )}
                          {tank.lastDipAt && (
                            <div>
                              {t("stock.dipped")} {formatStamp(tank.lastDipAt)}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="divider" />
              <div className="row" style={{ gap: 40, flexWrap: "wrap" }}>
                <Stat
                  label={t("stock.stockInGround")}
                  amount={totals.stock}
                  format={(n) => `${money(n)} L`}
                />
                <Stat
                  label={t("stock.spaceForDelivery")}
                  amount={totals.ullage}
                  format={(n) => `${money(n)} L`}
                />
                <Stat
                  label={t("stock.totalCapacity")}
                  amount={totals.capacity}
                  format={(n) => `${money(n)} L`}
                />
              </div>
            </>
          )}
        </Panel>

        {selectedTank && (
          <Panel
            title={
              <span className="row" style={{ gap: 7, alignItems: "center" }}>
                <GaugeIcon /> {selectedTank.name}
              </span>
            }
            note={`${selectedTank.fuelType} · ${money(selectedTank.capacity)} L`}
            actions={
              <div className="row" style={{ gap: 8 }}>
                <button
                  type="button"
                  className={mode === "dip" ? "primary" : ""}
                  onClick={() => setMode("dip")}
                >
                  {t("stock.recordDip")}
                </button>
                <button
                  type="button"
                  className={mode === "delivery" ? "primary" : ""}
                  onClick={() => setMode("delivery")}
                >
                  {t("stock.bookDelivery")}
                </button>
              </div>
            }
          >
            {mode === "dip" ? (
              <DipForm
                tank={selectedTank}
                busy={busy}
                onSubmit={(reading) =>
                  run(() => recordDip(stationId, selectedTank.id, reading))
                }
              />
            ) : (
              <DeliveryForm
                tank={selectedTank}
                busy={busy}
                onSubmit={(delivery) =>
                  run(() => recordDelivery(stationId, selectedTank.id, delivery))
                }
              />
            )}

            {isOwner && (
              <>
                <div className="divider" />
                <div className="between">
                  <span className="small muted">
                    {selectedTank.state === "retired"
                      ? t("stock.tankRetired")
                      : t("stock.tankActiveNote")}
                  </span>
                  <button
                    type="button"
                    className="quiet"
                    disabled={busy}
                    onClick={() =>
                      run(() =>
                        setTankState(
                          stationId,
                          selectedTank.id,
                          selectedTank.state === "retired" ? "active" : "retired"
                        )
                      )
                    }
                  >
                    {selectedTank.state === "retired"
                      ? t("stock.returnToService")
                      : t("stock.takeOutOfService")}
                  </button>
                </div>
              </>
            )}
          </Panel>
        )}

        <Panel title={t("stock.logTitle")} note={t("stock.logNote")} flush>
          {visibleDips.length === 0 ? (
            <Empty>
              {dips.length === 0 ? t("stock.noReadings") : t("stock.noReadingsInRange")}
            </Empty>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>{t("stock.when")}</th>
                  <th>{t("stock.tankCol")}</th>
                  <th>{t("stock.entry")}</th>
                  <th className="num">{t("stock.change")}</th>
                  <th className="num">{t("stock.stockAfter")}</th>
                  <th className="num">{t("stock.temp")}</th>
                  <th className="num">{t("stock.water")}</th>
                  <th>{t("stock.by")}</th>
                </tr>
              </thead>
              <tbody>
                {visibleDips.slice(0, 40).map((d) => {
                  const tank = tanks.find((x) => x.id === d.tankId);
                  const up = num(d.change) > 0;
                  return (
                    <tr key={d.id}>
                      <td className="mono small">{formatStamp(d.recordedAt)}</td>
                      <td>{tank?.name || "—"}</td>
                      <td>
                        {d.kind === "delivery" ? (
                          <span className="tag green">{t("stock.delivery")}</span>
                        ) : (
                          <span className="tag">{t("stock.dip")}</span>
                        )}
                        {d.note && <div className="small muted">{d.note}</div>}
                      </td>
                      <td
                        className="num mono"
                        style={{ color: up ? "var(--green)" : "var(--rust)" }}
                      >
                        {d.change == null ? "—" : `${up ? "+" : ""}${money(d.change)}`}
                      </td>
                      <td className="num mono">{money(d.stockLitres)}</td>
                      <td className="num mono">
                        {d.temperatureC == null
                          ? "—"
                          : `${num(d.temperatureC).toFixed(1)}°`}
                      </td>
                      <td className="num mono">
                        {d.waterCm == null ? "—" : `${num(d.waterCm).toFixed(1)}`}
                      </td>
                      <td className="small">{d.recordedByName || "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </Panel>

        {Object.keys(byProduct).length > 0 && (
          <Panel title={t("stock.byProduct")} flush>
            <table>
              <thead>
                <tr>
                  <th>{t("stock.product")}</th>
                  <th className="num">{t("stock.tanksTitle")}</th>
                  <th className="num">{t("stock.inGround")}</th>
                  <th className="num">{t("stock.capacity")}</th>
                  <th className="num">{t("stock.roomForDelivery")}</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(byProduct).map(([fuel, v]) => (
                  <tr key={fuel}>
                    <td>
                      <span className="row" style={{ gap: 6, alignItems: "center" }}>
                        <span className={`fuel-dot fuel-dot--${fuelClass(fuel)}`} />
                        {fuel}
                      </span>
                    </td>
                    <td className="num mono">{v.tanks}</td>
                    <td className="num mono">{money(v.stock)}</td>
                    <td className="num mono">{money(v.capacity)}</td>
                    <td className="num mono">{money(v.ullage)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </Panel>
        )}
      </div>
    </>
  );
}

/* ------------------------------------------------------------------ */

function AddTankForm({ onSubmit, onCancel, busy, existing }) {
  const { t } = useLanguage();
  const [form, setForm] = useState({
    name: `Tank ${existing + 1}`,
    fuelType: "Petrol",
    capacity: "",
    currentStock: "",
  });

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const ready = form.name.trim() && num(form.capacity) > 0;

  return (
    <Panel
      title={
        <span className="row" style={{ gap: 7, alignItems: "center" }}>
          <TankIcon /> {t("stock.addTankTitle")}
        </span>
      }
      note={t("stock.capacityNote")}
    >
      <div className="stack">
        <div className="form-grid">
          <Field label={t("stock.tankName")}>
            <input value={form.name} onChange={set("name")} placeholder="Tank 1" />
          </Field>
          <Field label={t("stock.product")}>
            <select value={form.fuelType} onChange={set("fuelType")}>
              {FUEL_TYPES.map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
            </select>
          </Field>
          <Field label={t("stock.capacity")} hint={t("common.litres")}>
            <input
              className="mono"
              inputMode="decimal"
              style={{ textAlign: "right" }}
              value={form.capacity}
              onChange={set("capacity")}
              placeholder="20000"
            />
          </Field>
          <Field label={t("stock.stockNow")} hint={t("stock.stockNowHint")}>
            <input
              className="mono"
              inputMode="decimal"
              style={{ textAlign: "right" }}
              value={form.currentStock}
              onChange={set("currentStock")}
              placeholder="12000"
            />
          </Field>
        </div>
        <div className="row">
          <button
            className="primary"
            type="button"
            disabled={busy || !ready}
            onClick={() =>
              onSubmit({
                name: form.name.trim(),
                fuelType: form.fuelType,
                capacity: num(form.capacity),
                currentStock: num(form.currentStock),
              })
            }
          >
            {busy ? t("stock.adding") : t("stock.addTank")}
          </button>
          <button type="button" onClick={onCancel} disabled={busy}>
            {t("common.cancel")}
          </button>
        </div>
      </div>
    </Panel>
  );
}

/**
 * A dip reading. Temperature is required, not optional: without it two
 * readings of the same fuel are not comparable, because the volume moves
 * with the thermometer.
 */
function DipForm({ tank, onSubmit, busy }) {
  const { t } = useLanguage();
  const [form, setForm] = useState({
    stockLitres: "",
    temperatureC: "",
    waterCm: "",
    note: "",
  });
  const [problems, setProblems] = useState([]);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const preview = useMemo(
    () =>
      tankStatus({
        ...tank,
        currentStock: form.stockLitres === "" ? tank.currentStock : num(form.stockLitres),
        temperatureC:
          form.temperatureC === "" ? tank.temperatureC : num(form.temperatureC),
      }),
    [tank, form.stockLitres, form.temperatureC]
  );

  const change =
    form.stockLitres === "" ? null : num(form.stockLitres) - num(tank.currentStock);

  const submit = async () => {
    const found = validateDip(form, tank);
    if (found.length) {
      setProblems(found);
      return;
    }
    setProblems([]);
    const ok = await onSubmit({
      stockLitres: num(form.stockLitres),
      temperatureC: num(form.temperatureC),
      waterCm: form.waterCm === "" ? null : num(form.waterCm),
      note: form.note,
    });
    if (ok) setForm({ stockLitres: "", temperatureC: "", waterCm: "", note: "" });
  };

  return (
    <div className="stack">
      <div className="form-grid">
        <Field label={t("stock.stockOnStick")} hint={t("common.litres")}>
          <input
            className="mono"
            inputMode="decimal"
            style={{ textAlign: "right" }}
            value={form.stockLitres}
            onChange={set("stockLitres")}
            placeholder={money(tank.currentStock)}
          />
        </Field>
        <Field
          label={t("stock.fuelTemperature")}
          hint={`°C, ${TEMP_RANGE.min}–${TEMP_RANGE.max}`}
        >
          <input
            className="mono"
            inputMode="decimal"
            style={{ textAlign: "right" }}
            value={form.temperatureC}
            onChange={set("temperatureC")}
            placeholder="30.0"
          />
        </Field>
        <Field label={t("stock.water")} hint={t("stock.waterHint")}>
          <input
            className="mono"
            inputMode="decimal"
            style={{ textAlign: "right" }}
            value={form.waterCm}
            onChange={set("waterCm")}
            placeholder="0.0"
          />
        </Field>
        <Field label={t("common.note")} hint={t("common.optional")}>
          <input
            value={form.note}
            onChange={set("note")}
            placeholder={t("stock.morningDip")}
          />
        </Field>
      </div>

      <div className="row" style={{ gap: 36, flexWrap: "wrap" }}>
        <Stat
          label={t("stock.changeOnLast")}
          value={change == null ? "—" : `${change > 0 ? "+" : ""}${money(change)} L`}
          tone={change == null ? undefined : change < 0 ? "neg" : "pos"}
        />
        <Stat
          label={t("stock.fillAfterDip")}
          value={`${Math.round(preview.fillPercent)}%`}
        />
        <Stat
          label={t("stock.volumeAt", { temp: REFERENCE_TEMP_C })}
          value={preview.volumeAt15 == null ? "—" : `${money(preview.volumeAt15)} L`}
        />
      </div>

      {problems.length > 0 && (
        <Notice kind="error">
          <ul style={{ margin: 0, paddingLeft: 18 }}>
            {problems.map((p, i) => (
              <li key={i}>{p}</li>
            ))}
          </ul>
        </Notice>
      )}

      <div>
        <button className="primary" type="button" disabled={busy} onClick={submit}>
          {busy ? t("common.saving") : t("stock.saveDip")}
        </button>
      </div>
    </div>
  );
}

/** Book a tanker in. Ullage is checked before anything is written. */
function DeliveryForm({ tank, onSubmit, busy }) {
  const { t } = useLanguage();
  const [form, setForm] = useState({
    litres: "",
    temperatureC: "",
    invoice: "",
    note: "",
  });
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const st = tankStatus(tank);
  const litres = num(form.litres);
  const after = num(tank.currentStock) + litres;
  const overfills = litres > 0 && after > num(tank.capacity);
  const ready = litres > 0 && form.temperatureC !== "" && !overfills;

  return (
    <div className="stack">
      <div className="form-grid">
        <Field label={t("stock.quantityDelivered")} hint={t("common.litres")}>
          <input
            className="mono"
            inputMode="decimal"
            style={{
              textAlign: "right",
              borderColor: overfills ? "var(--rust)" : undefined,
            }}
            value={form.litres}
            onChange={set("litres")}
            placeholder={money(st.ullage)}
          />
        </Field>
        <Field label={t("stock.temperatureOnArrival")} hint="°C">
          <input
            className="mono"
            inputMode="decimal"
            style={{ textAlign: "right" }}
            value={form.temperatureC}
            onChange={set("temperatureC")}
            placeholder="32.0"
          />
        </Field>
        <Field label={t("stock.invoiceNumber")} hint={t("common.optional")}>
          <input value={form.invoice} onChange={set("invoice")} placeholder="TL-44821" />
        </Field>
        <Field label={t("common.note")} hint={t("common.optional")}>
          <input value={form.note} onChange={set("note")} placeholder="IOC tanker" />
        </Field>
      </div>

      <div className="row" style={{ gap: 36, flexWrap: "wrap" }}>
        <Stat label={t("stock.spaceBefore")} value={`${money(st.ullage)} L`} />
        <Stat
          label={t("stock.stockAfterDelivery")}
          value={litres > 0 ? `${money(after)} L` : `${money(st.stock)} L`}
          tone={overfills ? "neg" : undefined}
        />
      </div>

      {overfills && (
        <Notice kind="error">
          {t("stock.overfill", {
            litres: money(litres),
            ullage: money(st.ullage),
          })}
        </Notice>
      )}

      <div>
        <button
          className="primary"
          type="button"
          disabled={busy || !ready}
          onClick={async () => {
            const ok = await onSubmit({
              litres,
              temperatureC: num(form.temperatureC),
              invoice: form.invoice,
              note: form.note,
            });
            if (ok) setForm({ litres: "", temperatureC: "", invoice: "", note: "" });
          }}
        >
          {busy ? t("stock.booking") : t("stock.bookDelivery")}
        </button>
      </div>
    </div>
  );
}
