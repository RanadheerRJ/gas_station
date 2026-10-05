import { useEffect, useState } from "react";
import { useLanguage } from "../../state/LanguageContext.jsx";

const STORAGE_KEY = "petrav.money-legend.open";

function savedOpenState() {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage?.getItem(STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

/** A small, optional key for the semantic money colours, remembered per device. */
export default function MoneyLegend() {
  const { t } = useLanguage();
  const [open, setOpen] = useState(savedOpenState);

  useEffect(() => {
    try {
      window.localStorage?.setItem(STORAGE_KEY, open ? "1" : "0");
    } catch {
      /* Storage can be unavailable in private mode; the legend still works. */
    }
  }, [open]);

  return (
    <div className="money-legend">
      <button
        type="button"
        className="money-legend__toggle"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <span aria-hidden="true">{open ? "−" : "+"}</span>
        {t("money.legendTitle")}
      </button>
      {open && (
        <div className="money-legend__items">
          <span className="money-legend__item money-legend__item--in">
            <b aria-hidden="true">+</b> {t("money.legendReceived")}
          </span>
          <span className="money-legend__item money-legend__item--out">
            <b aria-hidden="true">−</b> {t("money.legendSpent")}
          </span>
          <span className="money-legend__item money-legend__item--credit">
            <b aria-hidden="true">◷</b> {t("money.legendCredit")}
          </span>
          <span className="money-legend__item money-legend__item--neutral">
            <b aria-hidden="true">=</b> {t("money.legendTotals")}
          </span>
        </div>
      )}
    </div>
  );
}
