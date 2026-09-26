import { Field } from "../../components/ui";
import { NozzleIcon, PumpIcon } from "../../components/icons";
import { fuelClass } from "../../lib/fuel.js";
import { money } from "../../lib/format";
import { useLanguage } from "../../state/LanguageContext.jsx";
import { FUEL_TYPES } from "./useStationSetup.js";

/**
 * One pump: its nozzles, the form that adds another, and the tank each
 * nozzle draws from. A nozzle with no tank mapping blocks shift close, so
 * the gap is shown loudly rather than left to be discovered at handover.
 */
export default function PumpCard({
  pump,
  nozzles,
  tanks,
  active,
  busy,
  nozzleFor,
  nozzleForm,
  setNozzleForm,
  onToggleNozzleForm,
  onSubmitNozzle,
  onTogglePumpState,
  onToggleNozzleState,
  onAssignTank,
}) {
  const { t, tn } = useLanguage();
  const mine = nozzles.filter((n) => n.pumpId === pump.id);

  return (
    <div style={{ borderBottom: "1px solid var(--hairline)" }}>
      <div
        className="between"
        style={{
          padding: "10px 14px",
          background: "var(--surface-sunken)",
        }}
      >
        <span className="row" style={{ gap: 7, alignItems: "center" }}>
          <PumpIcon size={16} />
          <strong>{pump.name}</strong>
          <span className="tag">
            {tn(mine.length, "setup.nozzleCountOne", "setup.nozzleCount")}
          </span>
        </span>
        <span className="row" style={{ gap: 4 }}>
          <button
            type="button"
            className="quiet"
            onClick={() => onToggleNozzleForm(pump.id)}
          >
            {nozzleFor === pump.id ? t("common.cancel") : t("setup.addNozzle")}
          </button>
          <button type="button" className="quiet" onClick={() => onTogglePumpState(pump)}>
            {pump.state === "retired"
              ? t("setup.returnToService")
              : t("setup.outOfService")}
          </button>
        </span>
      </div>

      {nozzleFor === pump.id && (
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
                onChange={(e) => setNozzleForm((f) => ({ ...f, name: e.target.value }))}
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
            <Field label={t("setup.meterNow")} hint={t("setup.meterNowHint")}>
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
            onClick={() => onSubmitNozzle(pump.id)}
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
                <td>
                  {(() => {
                    // Meter sales are posted to this tank at
                    // shift close; an unmapped nozzle blocks
                    // closing, so surface the gap loudly.
                    const options = tanks.filter(
                      (tank) => tank.fuelType.toLowerCase() === n.fuelType.toLowerCase()
                    );
                    if (options.length === 0) {
                      return <span className="tag rust">{t("setup.noTankForFuel")}</span>;
                    }
                    return (
                      <select
                        value={n.tankId || ""}
                        disabled={busy}
                        onChange={(e) =>
                          e.target.value && onAssignTank(n.id, e.target.value)
                        }
                      >
                        {!n.tankId && <option value="">{t("setup.pickTank")}</option>}
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
                  {active[n.fuelType] ? money(active[n.fuelType].price) : "—"}
                </td>
                <td className="num">
                  <button
                    type="button"
                    className="quiet"
                    onClick={() => onToggleNozzleState(n)}
                  >
                    {n.state === "retired" ? t("setup.return") : t("setup.outOfService")}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
