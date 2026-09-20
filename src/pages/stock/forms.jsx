import { useMemo, useState } from "react";
import { Field, Notice, Stat } from "../../components/ui.jsx";
import {
  tankStatus,
  validateDip,
  TEMP_RANGE,
  REFERENCE_TEMP_C,
} from "../../lib/tankMath";
import { money, num } from "../../lib/format";
import { FUEL_TYPES } from "../../lib/fuel.js";
import { useDraft } from "../../state/useDraft.js";
import { useLanguage } from "../../state/LanguageContext.jsx";

/**
 * The tank forms, shared by the tank detail screen. Each is a real <form>
 * with an id, so the screen's pinned action bar can submit it from outside
 * the card: the primary action lives in the same place on every screen.
 */

export function AddTankForm({ onSubmit, onCancel, busy, existing }) {
  const { t } = useLanguage();
  const [form, setForm] = useState({
    name: `Tank ${existing + 1}`,
    fuelType: "Petrol",
    capacity: "",
    currentStock: "",
  });

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));
  const ready = form.name.trim() && num(form.capacity) > 0;

  return (
    <div className="stack" style={{ gap: 14 }}>
      <div className="form-grid">
        <Field label={t("stock.tankName")}>
          <input value={form.name} onChange={set("name")} placeholder="Tank 1" />
        </Field>
        <Field label={t("stock.product")}>
          <select value={form.fuelType} onChange={set("fuelType")}>
            {FUEL_TYPES.map((fuel) => (
              <option key={fuel} value={fuel}>
                {fuel}
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
          className="cta"
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
  );
}

/**
 * A dip reading. Temperature is required, not optional: without it two
 * readings of the same fuel are not comparable, because the volume moves
 * with the thermometer.
 */
export function DipForm({ tank, onSubmit }) {
  const { t } = useLanguage();
  // A dip is read off a wet stick at the tank — draft it per tank so a
  // failed save or a dead phone doesn't send anyone back out with the stick.
  const [form, setForm] = useDraft(`dip:${tank.id}`, {
    stockLitres: "",
    temperatureC: "",
    waterCm: "",
    note: "",
  });
  const [problems, setProblems] = useState([]);

  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

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

  const submit = async (e) => {
    e.preventDefault();
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
    <form id="tank-dip-form" className="stack" style={{ gap: 14 }} onSubmit={submit}>
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
            {problems.map((problem, index) => (
              <li key={index}>{problem}</li>
            ))}
          </ul>
        </Notice>
      )}
    </form>
  );
}

/** Book a tanker in. Ullage is checked before anything is written. */
export function DeliveryForm({ tank, onSubmit }) {
  const { t } = useLanguage();
  // Invoice number and arrival temperature come off the tanker's paperwork
  // — draft them per tank so a failed booking doesn't lose the transcription.
  const [form, setForm] = useDraft(`delivery:${tank.id}`, {
    litres: "",
    temperatureC: "",
    invoice: "",
    note: "",
  });
  const set = (key) => (e) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const st = tankStatus(tank);
  const litres = num(form.litres);
  const after = num(tank.currentStock) + litres;
  const overfills = litres > 0 && after > num(tank.capacity);
  const ready = litres > 0 && form.temperatureC !== "" && !overfills;

  return (
    <form
      id="tank-delivery-form"
      className="stack"
      style={{ gap: 14 }}
      onSubmit={async (e) => {
        e.preventDefault();
        if (!ready) return;
        const ok = await onSubmit({
          litres,
          temperatureC: num(form.temperatureC),
          invoice: form.invoice,
          note: form.note,
        });
        if (ok) setForm({ litres: "", temperatureC: "", invoice: "", note: "" });
      }}
    >
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
    </form>
  );
}
