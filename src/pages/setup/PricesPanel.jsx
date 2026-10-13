import { useState } from "react";
import { Empty, Panel } from "../../components/ui";
import ListRow from "../../components/ListRow.jsx";
import Sheet from "../../components/Sheet.jsx";
import { formatDate, todayISO } from "../../lib/format";
import { RateIcon } from "../../components/icons";
import { fuelClass } from "../../lib/fuel.js";
import { formatStamp, money, num } from "../../lib/format";
import { useLanguage } from "../../state/LanguageContext.jsx";

/**
 * Today's pump price per fuel, and the history behind it.
 *
 * Prices are effective-dated intervals, never overwritten, so a past shift
 * always reprices correctly — which is why this panel updates rather than
 * edits, and shows when each price came into force.
 */
export default function PricesPanel({
  activeFuels,
  active,
  priceRecords,
  rateDraft,
  setRateDraft,
  busy,
  onUpdatePrice,
}) {
  const { t } = useLanguage();
  const [editing, setEditing] = useState(null);
  return (
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
          <div className="stack">
            {activeFuels.map((fuel) => {
              const rec = active[fuel];
              return (
                <ListRow
                  key={fuel}
                  title={fuel}
                  subtitle={
                    rec
                      ? `${t("setup.activeSince")} ${formatStamp(rec.effectiveFrom)}`
                      : t("setup.cannotStart")
                  }
                  trailing={
                    <span className="price-card__value">
                      {rec ? `₹ ${money(rec.price)}` : t("setup.notSet")}
                    </span>
                  }
                  onClick={() => {
                    setEditing(fuel);
                    setRateDraft((d) => ({ ...d, [fuel]: rec ? String(rec.price) : "" }));
                  }}
                />
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
                          <span className="row" style={{ gap: 6, alignItems: "center" }}>
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
      <Sheet open={!!editing} onClose={() => setEditing(null)} title={editing || ""}>
        {editing && (
          <div className="stack">
            <label className="amount-field">
              <span>₹</span>
              <input
                autoFocus
                className="mono"
                inputMode="decimal"
                aria-label={t("shifts.price")}
                value={rateDraft[editing] ?? ""}
                onChange={(e) =>
                  setRateDraft((d) => ({ ...d, [editing]: e.target.value }))
                }
              />
            </label>
            <p className="small muted">
              {t("setup.from")}: {formatDate(todayISO())}
            </p>
            <button
              type="button"
              className="cta"
              disabled={
                busy ||
                !(num(rateDraft[editing]) > 0) ||
                num(rateDraft[editing]) === num(active[editing]?.price)
              }
              onClick={() => {
                onUpdatePrice(editing, rateDraft[editing]);
                setEditing(null);
              }}
            >
              {t("setup.update")}
            </button>
          </div>
        )}
      </Sheet>
    </Panel>
  );
}
