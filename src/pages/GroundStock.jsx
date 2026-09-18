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
  const retired = useMemo(() => tanks.filter((t) => t.state === "retired"), [tanks]);
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
  const wet = active.filter((t) => num(t.waterCm) > WATER_LIMIT_CM);

  if (stationsLoading) {
    return (
      <>
        <PageHeader title="Ground stock" />
        <div className="content">
          <Empty>Loading…</Empty>
        </div>
      </>
    );
  }

  return (
    <>
      <PageHeader
        title="Ground stock"
        sub={
          station
            ? `${station.name} · ${tanks.length} tank${tanks.length === 1 ? "" : "s"}`
            : ""
        }
        actions={
          isOwner && (
            <button type="button" onClick={() => setShowAdd((v) => !v)}>
              {showAdd ? "Cancel" : "Add tank"}
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
              onChange={(id) => setParams({ station: id })}
            />
          </Panel>
        )}

        {error && <Notice kind="error">{error}</Notice>}

        {totals.low > 0 && (
          <Notice kind="error">
            {totals.low} tank{totals.low === 1 ? " is" : "s are"} at or below a quarter
            full. Place an order before a nozzle runs dry.
          </Notice>
        )}

        {wet.length > 0 && (
          <Notice kind="error">
            Water above {WATER_LIMIT_CM} cm in{" "}
            {wet.map((t) => t.name).join(", ")}. Water corrodes the tank and dilutes
            the next delivery — have it drawn off.
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

        <Panel
          title="Tanks"
          note="Each vessel is drawn to its current level. Tap one to dip it or book a delivery."
        >
          {loading ? (
            <Empty>Loading tanks…</Empty>
          ) : tanks.length === 0 ? (
            <Empty>
              No tanks set up yet.
              {isOwner
                ? " Add one to start recording dips and temperatures."
                : " An owner needs to add them first."}
            </Empty>
          ) : (
            <>
              <div className="tank-farm">
                {active.map((t) => {
                  const st = tankStatus(t);
                  const warm = num(t.temperatureC) > 35;
                  return (
                    <div
                      key={t.id}
                      className={`tank-card${selected === t.id ? " selected" : ""}`}
                      onClick={() => {
                        setSelected(selected === t.id ? null : t.id);
                        setMode("dip");
                      }}
                      style={{ cursor: "pointer" }}
                    >
                      <TankVessel tank={t} />
                      <div className="tank-card__body">
                        <div className="tank-card__name">
                          <span className={`fuel-dot fuel-dot--${fuelClass(t.fuelType)}`} />
                          {t.name}
                        </div>
                        <div className="tank-card__fuel">{t.fuelType}</div>

                        <div className="tank-card__figure">
                          {money(st.stock)} <span>L</span>
                          <div className="tank-card__fuel">
                            of {money(st.capacity)} L · {money(st.ullage)} L space
                          </div>
                        </div>

                        <div className="tank-card__meta">
                          {t.temperatureC == null ? (
                            <span className="muted">No temperature recorded</span>
                          ) : (
                            <span className={`temp-chip${warm ? " warm" : ""}`}>
                              {num(t.temperatureC).toFixed(1)} °C
                            </span>
                          )}
                          {st.volumeAt15 != null && (
                            <div>
                              {money(st.volumeAt15)} L at {REFERENCE_TEMP_C} °C
                            </div>
                          )}
                          {t.lastDipAt && <div>Dipped {formatStamp(t.lastDipAt)}</div>}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>

              <div className="divider" />
              <div className="row" style={{ gap: 40, flexWrap: "wrap" }}>
                <Stat label="Stock in ground" value={`${money(totals.stock)} L`} />
                <Stat label="Space for delivery" value={`${money(totals.ullage)} L`} />
                <Stat
                  label="Total capacity"
                  value={`${money(totals.capacity)} L`}
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
            note={`${selectedTank.fuelType} · ${money(selectedTank.capacity)} L tank`}
            actions={
              <div className="row" style={{ gap: 8 }}>
                <button
                  type="button"
                  className={mode === "dip" ? "primary" : ""}
                  onClick={() => setMode("dip")}
                >
                  Record dip
                </button>
                <button
                  type="button"
                  className={mode === "delivery" ? "primary" : ""}
                  onClick={() => setMode("delivery")}
                >
                  Book delivery
                </button>
              </div>
            }
          >
            {mode === "dip" ? (
              <DipForm
                tank={selectedTank}
                busy={busy}
                onSubmit={(reading) =>
                  run(() => recordDip(stationId, selectedTank.id, reading, profile))
                }
              />
            ) : (
              <DeliveryForm
                tank={selectedTank}
                busy={busy}
                onSubmit={(delivery) =>
                  run(() =>
                    recordDelivery(stationId, selectedTank.id, delivery, profile)
                  )
                }
              />
            )}

            {isOwner && (
              <>
                <div className="divider" />
                <div className="between">
                  <span className="small muted">
                    {selectedTank.state === "retired"
                      ? "This tank is out of service. Its dip history is kept."
                      : "Taking a tank out of service hides it from the daily screens. Nothing is deleted."}
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
                          selectedTank.state === "retired" ? "active" : "retired",
                          profile
                        )
                      )
                    }
                  >
                    {selectedTank.state === "retired"
                      ? "Return to service"
                      : "Take out of service"}
                  </button>
                </div>
              </>
            )}
          </Panel>
        )}

        <Panel
          title="Dip and delivery log"
          note="Readings are never edited. A wrong dip is corrected by taking another one."
          flush
        >
          {dips.length === 0 ? (
            <Empty>No readings recorded yet.</Empty>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>When</th>
                  <th>Tank</th>
                  <th>Entry</th>
                  <th className="num">Change</th>
                  <th className="num">Stock after</th>
                  <th className="num">Temp</th>
                  <th className="num">Water</th>
                  <th>By</th>
                </tr>
              </thead>
              <tbody>
                {dips.slice(0, 40).map((d) => {
                  const tank = tanks.find((t) => t.id === d.tankId);
                  const up = num(d.change) > 0;
                  return (
                    <tr key={d.id}>
                      <td className="mono small">{formatStamp(d.recordedAt)}</td>
                      <td>{tank?.name || "—"}</td>
                      <td>
                        {d.kind === "delivery" ? (
                          <span className="tag green">Delivery</span>
                        ) : (
                          <span className="tag">Dip</span>
                        )}
                        {d.note && <div className="small muted">{d.note}</div>}
                      </td>
                      <td
                        className="num mono"
                        style={{ color: up ? "var(--green)" : "var(--rust)" }}
                      >
                        {d.change == null
                          ? "—"
                          : `${up ? "+" : ""}${money(d.change)}`}
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
          <Panel title="Stock by product" flush>
            <table>
              <thead>
                <tr>
                  <th>Product</th>
                  <th className="num">Tanks</th>
                  <th className="num">In ground</th>
                  <th className="num">Capacity</th>
                  <th className="num">Room for delivery</th>
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
          <TankIcon /> Add a tank
        </span>
      }
      note="Capacity comes off the tank chart supplied with the vessel."
    >
      <div className="stack">
        <div className="form-grid">
          <Field label="Tank name">
            <input value={form.name} onChange={set("name")} placeholder="Tank 1" />
          </Field>
          <Field label="Product">
            <select value={form.fuelType} onChange={set("fuelType")}>
              {FUEL_TYPES.map((f) => (
                <option key={f} value={f}>
                  {f}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Capacity" hint="litres">
            <input
              className="mono"
              inputMode="decimal"
              style={{ textAlign: "right" }}
              value={form.capacity}
              onChange={set("capacity")}
              placeholder="20000"
            />
          </Field>
          <Field label="Stock now" hint="litres, from the dip stick">
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
            {busy ? "Adding…" : "Add tank"}
          </button>
          <button type="button" onClick={onCancel} disabled={busy}>
            Cancel
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
        temperatureC: form.temperatureC === "" ? tank.temperatureC : num(form.temperatureC),
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
        <Field label="Stock on the stick" hint="litres">
          <input
            className="mono"
            inputMode="decimal"
            style={{ textAlign: "right" }}
            value={form.stockLitres}
            onChange={set("stockLitres")}
            placeholder={money(tank.currentStock)}
          />
        </Field>
        <Field label="Fuel temperature" hint={`°C, ${TEMP_RANGE.min}–${TEMP_RANGE.max}`}>
          <input
            className="mono"
            inputMode="decimal"
            style={{ textAlign: "right" }}
            value={form.temperatureC}
            onChange={set("temperatureC")}
            placeholder="30.0"
          />
        </Field>
        <Field label="Water" hint="cm, optional">
          <input
            className="mono"
            inputMode="decimal"
            style={{ textAlign: "right" }}
            value={form.waterCm}
            onChange={set("waterCm")}
            placeholder="0.0"
          />
        </Field>
        <Field label="Note" hint="optional">
          <input value={form.note} onChange={set("note")} placeholder="Morning dip" />
        </Field>
      </div>

      <div className="row" style={{ gap: 36, flexWrap: "wrap" }}>
        <Stat
          label="Change on last reading"
          value={change == null ? "—" : `${change > 0 ? "+" : ""}${money(change)} L`}
          tone={change == null ? undefined : change < 0 ? "neg" : "pos"}
        />
        <Stat label="Fill after dip" value={`${Math.round(preview.fillPercent)}%`} />
        <Stat
          label={`Volume at ${REFERENCE_TEMP_C} °C`}
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
          {busy ? "Saving…" : "Save dip reading"}
        </button>
      </div>
    </div>
  );
}

/** Book a tanker in. Ullage is checked before anything is written. */
function DeliveryForm({ tank, onSubmit, busy }) {
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
        <Field label="Quantity delivered" hint="litres">
          <input
            className="mono"
            inputMode="decimal"
            style={{ textAlign: "right", borderColor: overfills ? "var(--rust)" : undefined }}
            value={form.litres}
            onChange={set("litres")}
            placeholder={money(st.ullage)}
          />
        </Field>
        <Field label="Temperature on arrival" hint="°C">
          <input
            className="mono"
            inputMode="decimal"
            style={{ textAlign: "right" }}
            value={form.temperatureC}
            onChange={set("temperatureC")}
            placeholder="32.0"
          />
        </Field>
        <Field label="Invoice number" hint="optional">
          <input value={form.invoice} onChange={set("invoice")} placeholder="TL-44821" />
        </Field>
        <Field label="Note" hint="optional">
          <input value={form.note} onChange={set("note")} placeholder="IOC tanker" />
        </Field>
      </div>

      <div className="row" style={{ gap: 36, flexWrap: "wrap" }}>
        <Stat label="Space before" value={`${money(st.ullage)} L`} />
        <Stat
          label="Stock after"
          value={litres > 0 ? `${money(after)} L` : `${money(st.stock)} L`}
          tone={overfills ? "neg" : undefined}
        />
      </div>

      {overfills && (
        <Notice kind="error">
          {money(litres)} L will not fit. The tank has {money(st.ullage)} L of ullage —
          check the challan before booking it in.
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
          {busy ? "Booking…" : "Book delivery"}
        </button>
      </div>
    </div>
  );
}
