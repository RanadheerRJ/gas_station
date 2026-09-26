import { Empty, Panel } from "../../components/ui";
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
                      onClick={() => onUpdatePrice(fuel, draft)}
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
    </Panel>
  );
}
