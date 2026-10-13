import { Link } from "react-router-dom";
import Money from "../../components/Money.jsx";
import { ChevronIcon } from "../../components/icons.jsx";
import { avatarHue, initials } from "../../lib/avatar.js";
import { formatDate, formatStamp, money } from "../../lib/format.js";
import { shiftTotals } from "../../lib/shiftMath.js";
import { fuelClass } from "../../lib/fuel.js";
import { useLanguage } from "../../state/LanguageContext.jsx";
import { StatusTag } from "./parts.jsx";

/**
 * One chip per fuel product on a shift, e.g. "2 × MS". Nozzles group by the
 * fuel name printed on the dispenser, so the chip reads the way the pump
 * does, and the word carries the meaning rather than colour alone.
 */
export function nozzleGroups(nozzles) {
  const groups = new Map();
  for (const nozzle of nozzles || []) {
    const fuelType = nozzle.fuelType || "";
    const group = groups.get(fuelType) || {
      fuelType,
      cls: fuelClass(fuelType),
      count: 0,
    };
    group.count += 1;
    groups.set(fuelType, group);
  }
  return [...groups.values()];
}

/**
 * The two cards the shift screens are built from.
 *
 * Both follow the shape a delivery app gives an order: who it is on the
 * left, the one figure worth reading on the right, and a strip of detail
 * underneath — so twenty of them can be scanned without slowing down. The
 * running shift keeps the same silhouette and trades the chevron for the
 * actions that shift still needs.
 */
function OperatorAvatar({ name, live = false }) {
  return (
    <span
      className={`shift-card__avatar${live ? " shift-card__avatar--live" : ""}`}
      style={{ "--avatar-hue": avatarHue(name) }}
      aria-hidden="true"
    >
      {initials(name)}
    </span>
  );
}

function FuelChips({ nozzles }) {
  return nozzleGroups(nozzles).map((group) => (
    <span key={group.fuelType || "unknown"} className={`fuel-tag fuel-tag--${group.cls}`}>
      {group.count} × {group.fuelType || "—"}
    </span>
  ));
}

/**
 * A running shift.
 *
 * Nothing about it is final, so the card says what is true right now — who is
 * on it, how long it has been running, which products are on the pump — and
 * carries the three things still to be done with it, rather than a link to a
 * summary nobody has written yet.
 */
export function LiveShiftCard({ shift, closeHref, onAddExpense, onAddNozzle, elapsed }) {
  const { t, tn } = useLanguage();
  const name = shift.employeeName || "";
  return (
    <article className="shift-card shift-card--live">
      <OperatorAvatar name={name} live />
      <span className="shift-card__main">
        <span className="shift-card__name">{name}</span>
        <span className="shift-card__meta">
          {t("shifts.started")} {formatStamp(shift.startTime)} ·{" "}
          {tn(shift.nozzles.length, "shifts.nozzle", "shifts.nozzles")}
        </span>
      </span>
      <span className="live-pill">
        <span className="live-dot" aria-hidden="true" />
        {t("shifts.liveNow")}
        {elapsed ? ` · ${elapsed}` : ""}
      </span>
      <div className="shift-card__foot">
        <FuelChips nozzles={shift.nozzles} />
        {/* A running shift is not frozen: a free nozzle can still join it,
            and one taken by mistake can be given back. */}
        <span className="shift-card__actions">
          <button type="button" className="small" onClick={() => onAddExpense?.(shift)}>
            {t("shifts.addExpense")}
          </button>
          <button type="button" className="small" onClick={() => onAddNozzle?.(shift)}>
            {t("shifts.addNozzle")}
          </button>
          <Link className="shift-card__close" to={closeHref}>
            {t("shifts.closeShift")}
          </Link>
        </span>
      </div>
    </article>
  );
}

/**
 * A handed-in shift: one row answering "how much, and is it settled",
 * tappable through to the full breakdown.
 *
 * `title` is what the row is filed under — the operator's name on the
 * station's shift list, the date on the attendant's own history, where every
 * row belongs to the same person and the day is what tells them apart.
 */
export function ShiftCard({ shift, to, title }) {
  const { t } = useLanguage();
  const totals = shiftTotals(shift);
  const name = shift.employeeName || "";
  const dateLabel = formatDate(shift.date);
  const when = shift.endTime
    ? t("shifts.closedAt", { time: formatStamp(shift.endTime) })
    : title === dateLabel && shift.startTime
      ? `${t("shifts.started")} ${formatStamp(shift.startTime)}`
      : dateLabel;

  return (
    <Link to={to} className="shift-card">
      <OperatorAvatar name={name} />
      <span className="shift-card__main">
        <span className="shift-card__name">{title || name}</span>
        <span className="shift-card__meta">
          {when} · {t("shifts.litresValue", { litres: money(totals.totalLitres) })}
        </span>
      </span>
      <span className="shift-card__amount">
        <span className="k">{t("shifts.net")}</span>
        <Money kind="neutral" value={totals.net} label={t("shifts.net")} />
      </span>
      <span className="shift-card__foot">
        <StatusTag status={shift.status} reopened={Boolean(shift.approvedAt)} />
        <span className="shift-card__stat">
          <span className="k">{t("shifts.variance")}</span>
          <Money kind="variance" value={totals.variance} label={t("shifts.variance")} />
        </span>
        <span className="shift-card__stat">
          <span className="k">{t("shifts.gross")}</span>
          <span className="v mono">₹ {money(totals.gross)}</span>
        </span>
        <span className="shift-card__chev">
          <ChevronIcon size={17} />
        </span>
      </span>
    </Link>
  );
}
