import { useCallback, useEffect, useMemo, useState } from "react";
import Sheet from "../../components/Sheet.jsx";
import { LoadingPanels } from "../../components/motion.jsx";
import { CheckIcon, PumpIcon } from "../../components/icons.jsx";
import { useAuth } from "../../state/AuthContext.jsx";
import {
  addShiftNozzles,
  listNozzleOccupancy,
  listPumps,
  listShifts,
  readableError,
  removeShiftNozzle,
} from "../../lib/api";
import { money } from "../../lib/format";
import {
  ANONYMOUS_OPERATOR,
  SHIFT_STATUS,
  anonymousNozzleOccupancy,
  nozzleOccupancy,
} from "../../lib/shiftMath";
import { fuelClass } from "../../lib/fuel.js";
import { useLanguage } from "../../state/LanguageContext.jsx";

/**
 * The forecourt is not fixed at the moment a shift starts: a second pump goes
 * into service when the queue builds, or a nozzle was forgotten when the
 * shift was opened. This sheet is the door onto a running shift's nozzle
 * list — free nozzles to take, and the shift's own nozzles to release if one
 * was taken by mistake and never fuelled from.
 *
 * Availability comes from the same source the start-shift screen uses: an
 * attendant asks the anonymous occupancy RPC, while an owner or manager —
 * who may read the station's shifts — derives it from those rows and so sees
 * whose shift is holding a nozzle.
 *
 * A nozzle released here keeps its meter: the reading it was opened on is
 * still what the next shift starts from. Fuel already dispensed therefore
 * belongs in the close, not in a release, which is what the sheet says in
 * plain words.
 */
export default function AddNozzlesSheet({ open, onClose, shift, stationId, onChange }) {
  const { t, tn } = useLanguage();
  const { profile } = useAuth();
  const isAttendant = profile.role === "attendant";

  const [pumps, setPumps] = useState([]);
  const [nozzles, setNozzles] = useState([]);
  const [busyIds, setBusyIds] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  // Which of the two mutations is in flight, so each button can say what it
  // is doing rather than the other one's word.
  const [action, setAction] = useState(null);
  const [picked, setPicked] = useState([]);
  // Releasing is the destructive half of this sheet, so it is asked for
  // twice: one row at a time, in place, rather than a dialog over the sheet.
  const [confirming, setConfirming] = useState(null);

  const busy = action !== null;

  const load = useCallback(async () => {
    if (!stationId) return;
    setLoading(true);
    try {
      const [equipment, occupancy] = await Promise.all([
        listPumps(stationId),
        isAttendant
          ? listNozzleOccupancy(stationId)
          : listShifts(stationId).then((rows) =>
              nozzleOccupancy(rows.filter((s) => s.status === SHIFT_STATUS.OPEN))
            ),
      ]);
      setPumps(equipment.pumps);
      setNozzles(equipment.nozzles);
      setBusyIds(isAttendant ? anonymousNozzleOccupancy(occupancy || []) : occupancy);
      setError("");
    } catch (err) {
      setError(readableError(err));
    } finally {
      setLoading(false);
    }
  }, [stationId, isAttendant]);

  // Every opening starts from the forecourt as it is now — a nozzle may have
  // been taken or released since the last look.
  useEffect(() => {
    if (!open) return;
    setPicked([]);
    setConfirming(null);
    setError("");
    load();
  }, [open, load]);

  // The nozzles this shift already holds, with the reading each one opened on.
  const mine = useMemo(() => {
    const map = new Map();
    (shift?.nozzles || []).forEach((nozzle) => map.set(nozzle.nozzleId, nozzle));
    return map;
  }, [shift]);

  // A nozzle held by this shift is not "busy" here — it is listed with the way
  // to give it back. A retired nozzle stays visible only while this shift
  // holds it, so it can still be released.
  const shown = nozzles.filter(
    (nozzle) => mine.has(nozzle.id) || nozzle.state === "active"
  );
  const freeCount = shown.filter(
    (nozzle) => !mine.has(nozzle.id) && !busyIds[nozzle.id]
  ).length;
  const byPump = pumps
    .map((pump) => ({ pump, rows: shown.filter((nozzle) => nozzle.pumpId === pump.id) }))
    .filter(({ rows }) => rows.length > 0);

  const toggle = (nozzleId) => {
    setPicked((current) =>
      current.includes(nozzleId)
        ? current.filter((id) => id !== nozzleId)
        : [...current, nozzleId]
    );
  };

  const add = async () => {
    if (busy || picked.length === 0 || !shift) return;
    setAction("add");
    setError("");
    try {
      await addShiftNozzles(stationId, shift.id, picked);
      setPicked([]);
      await onChange();
      await load();
    } catch (err) {
      setError(readableError(err));
    } finally {
      setAction(null);
    }
  };

  const release = async (nozzleId) => {
    if (busy || !shift) return;
    setAction("release");
    setError("");
    try {
      await removeShiftNozzle(stationId, shift.id, nozzleId);
      setConfirming(null);
      await onChange();
      await load();
    } catch (err) {
      setError(readableError(err));
    } finally {
      setAction(null);
    }
  };

  return (
    <Sheet open={open} onClose={onClose} title={t("shifts.addNozzleTitle")}>
      <div className="stack" style={{ gap: 14 }}>
        {error && <div className="notice error">{error}</div>}

        {loading ? (
          <LoadingPanels count={1} lines={3} label={t("common.loading")} />
        ) : byPump.length === 0 ? (
          <div className="empty-card">
            <div className="empty-card__icon">
              <PumpIcon size={26} />
            </div>
            <h2>{t("shifts.noPumps")}</h2>
          </div>
        ) : (
          <>
            <p className="small muted">{t("shifts.addNozzleHelp")}</p>
            <div className="pick-board pick-board--sheet">
              {byPump.map(({ pump, rows }) => (
                <div key={pump.id} className="pick-card">
                  <div className="pick-card__head">
                    <span className="pick-card__name">
                      <PumpIcon size={16} />
                      {pump.name}
                    </span>
                  </div>
                  {rows.map((nozzle) => {
                    const held = mine.get(nozzle.id);
                    const elsewhere = held ? null : busyIds[nozzle.id];
                    if (held) {
                      return (
                        <div
                          key={nozzle.id}
                          className="nozzle-row nozzle-row--held"
                          data-testid={`held-${nozzle.id}`}
                        >
                          <span className="nozzle-row__body">
                            <span className="nozzle-row__title">
                              {nozzle.name}
                              <span
                                className={`fuel-tag fuel-tag--${fuelClass(
                                  nozzle.fuelType
                                )}`}
                              >
                                {nozzle.fuelType}
                              </span>
                            </span>
                            {/* Asking twice costs the reading line for a
                                moment, and puts the warning where the finger
                                already is. */}
                            <span className="nozzle-row__sub">
                              {confirming === nozzle.id
                                ? t("shifts.releaseConfirm")
                                : `${t("shifts.openingReading")} · ${money(
                                    held.openingReading
                                  )}`}
                            </span>
                          </span>
                          {confirming !== nozzle.id && (
                            <span className="nozzle-row__state">
                              {t("shifts.onThisShift")}
                            </span>
                          )}
                          {confirming === nozzle.id ? (
                            <>
                              <button
                                type="button"
                                className="small"
                                disabled={busy}
                                onClick={() => release(nozzle.id)}
                              >
                                {action === "release"
                                  ? t("shifts.removingNozzle")
                                  : t("common.confirm")}
                              </button>
                              <button
                                type="button"
                                className="quiet small"
                                disabled={busy}
                                onClick={() => setConfirming(null)}
                              >
                                {t("common.cancel")}
                              </button>
                            </>
                          ) : (
                            <button
                              type="button"
                              className="quiet small"
                              disabled={busy}
                              onClick={() => setConfirming(nozzle.id)}
                            >
                              {t("shifts.releaseNozzle")}
                            </button>
                          )}
                        </div>
                      );
                    }
                    const checked = picked.includes(nozzle.id);
                    return (
                      <button
                        key={nozzle.id}
                        type="button"
                        className={`nozzle-row${checked ? " selected" : ""}${
                          elsewhere ? " busy" : ""
                        }`}
                        disabled={!!elsewhere || busy}
                        aria-pressed={checked}
                        onClick={() => toggle(nozzle.id)}
                      >
                        <span className="nozzle-row__body">
                          <span className="nozzle-row__title">
                            {nozzle.name}
                            <span
                              className={`fuel-tag fuel-tag--${fuelClass(
                                nozzle.fuelType
                              )}`}
                            >
                              {nozzle.fuelType}
                            </span>
                          </span>
                          <span className="nozzle-row__sub">
                            {elsewhere
                              ? `${t("shifts.heldBy")} ${
                                  elsewhere.operator || ANONYMOUS_OPERATOR
                                }`
                              : `${t("shifts.openingReading")} · ${money(
                                  nozzle.lastReading
                                )}`}
                          </span>
                        </span>
                        <span
                          className={`nozzle-row__state${
                            elsewhere ? " nozzle-row__state--busy" : ""
                          }`}
                        >
                          {elsewhere ? t("shifts.busy") : t("shifts.free")}
                        </span>
                        <span className="nozzle-row__check" aria-hidden="true">
                          {checked && <CheckIcon size={14} />}
                        </span>
                      </button>
                    );
                  })}
                </div>
              ))}
            </div>
            {freeCount === 0 && (
              <p className="small muted">{t("shifts.noFreeNozzles")}</p>
            )}
          </>
        )}

        <div className="sheet-submit">
          <span className="action-bar__count" aria-live="polite">
            {tn(picked.length, "shifts.selectedOne", "shifts.selectedCount")}
          </span>
          <button
            type="button"
            className="cta"
            disabled={busy || picked.length === 0}
            onClick={add}
          >
            {action === "add"
              ? t("shifts.addingNozzles")
              : tn(picked.length, "shifts.addNozzleOne", "shifts.addNozzleMany")}
          </button>
        </div>
      </div>
    </Sheet>
  );
}
