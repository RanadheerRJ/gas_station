import { useCallback, useEffect, useMemo, useState } from "react";
import { Navigate, useNavigate } from "react-router-dom";
import { ScreenHeader } from "../../components/Layout.jsx";
import { ActionBar, Notice } from "../../components/ui.jsx";
import { LoadingPanels } from "../../components/motion.jsx";
import { CheckIcon, PumpIcon } from "../../components/icons.jsx";
import { useAuth } from "../../state/AuthContext.jsx";
import { useStation } from "../../state/useStation.js";
import {
  listNozzleOccupancy,
  listPumps,
  listShifts,
  openShift,
  readableError,
} from "../../lib/api";
import { money } from "../../lib/format";
import {
  SHIFT_STATUS,
  ANONYMOUS_OPERATOR,
  anonymousNozzleOccupancy,
  nozzleOccupancy,
} from "../../lib/shiftMath";
import { fuelClass } from "../../lib/fuel.js";
import { shiftPaths } from "../shifts/paths.js";
import { useLanguage } from "../../state/LanguageContext.jsx";

/**
 * Pick your nozzles and go — the forecourt as its own screen.
 *
 * Tapping a free nozzle claims it into your basket the way a delivery app
 * adds an item to a cart; the sticky bar keeps count, and the primary button
 * does the one thing this screen exists to do.
 *
 * Serves the attendant's `/today/start` and (for parity with the old single
 * page, where the button appeared for every role) the manager's and owner's
 * `/station/start` and `/owner/shifts/start`.
 */
export default function StartShift() {
  const { t, tn } = useLanguage();
  const { profile } = useAuth();
  const navigate = useNavigate();
  const { station, stationId, loading: stationsLoading } = useStation();
  const paths = shiftPaths(profile.role);

  const [shifts, setShifts] = useState([]);
  const [pumps, setPumps] = useState([]);
  const [nozzles, setNozzles] = useState([]);
  const [busyIds, setBusyIds] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [picked, setPicked] = useState([]);

  const isAttendant = profile.role === "attendant";

  const load = useCallback(async () => {
    if (!stationId) return;
    setLoading(true);
    try {
      // Attendants see nozzle availability through the anonymous RPC — never
      // a co-worker's shift. Managers and owners derive it from the
      // station-wide shifts they are entitled to read.
      const [own, equipment, occupancy] = await Promise.all([
        listShifts(stationId),
        listPumps(stationId),
        isAttendant ? listNozzleOccupancy(stationId) : Promise.resolve(null),
      ]);
      setShifts(own);
      setPumps(equipment.pumps);
      setNozzles(equipment.nozzles);
      setBusyIds(occupancy);
      setError("");
    } catch (err) {
      setError(readableError(err));
    } finally {
      setLoading(false);
    }
  }, [stationId, isAttendant]);

  useEffect(() => {
    load();
  }, [load]);

  const open = shifts.filter((s) => s.status === SHIFT_STATUS.OPEN);
  const myShift = open.find((s) => s.userId === profile.uid);

  const nozzleBusy = useMemo(() => {
    if (isAttendant) {
      return busyIds ? anonymousNozzleOccupancy(busyIds) : nozzleOccupancy(open);
    }
    return nozzleOccupancy(open);
  }, [isAttendant, busyIds, open]);

  // One open shift per person: if one is already running, this screen has
  // nothing to offer — go straight to it.
  if (!loading && myShift) {
    return <Navigate to={paths.run ? paths.run(myShift.id) : paths.home} replace />;
  }

  const toggle = (nozzleId) => {
    setPicked((current) =>
      current.includes(nozzleId)
        ? current.filter((id) => id !== nozzleId)
        : [...current, nozzleId]
    );
  };

  const start = async () => {
    if (busy || picked.length === 0) return;
    setBusy(true);
    setError("");
    try {
      const { shiftId } = await openShift(stationId, {
        employeeName: profile.name,
        nozzleIds: picked,
      });
      // The attendant lands on their running shift; a manager or owner goes
      // back to the list, where the new shift appears as an open card.
      navigate(paths.run ? paths.run(shiftId) : paths.home, { replace: true });
    } catch (err) {
      setError(readableError(err));
      setBusy(false);
    }
  };

  if (stationsLoading || loading) {
    return (
      <>
        <ScreenHeader title={t("shifts.startYours")} back={{ to: paths.home }} />
        <div className="content">
          <LoadingPanels count={2} lines={3} label={t("common.loading")} />
        </div>
      </>
    );
  }

  return (
    <>
      <ScreenHeader
        title={t("shifts.startYours")}
        sub={`${station ? station.name : ""}${
          station ? " · " : ""
        }${t("shifts.startNote")}`}
        back={{ to: paths.home }}
      />
      <div className="content stack">
        {error && <Notice kind="error">{error}</Notice>}

        {pumps.length === 0 ? (
          <div className="empty-card">
            <div className="empty-card__icon">
              <PumpIcon size={26} />
            </div>
            <h2>{t("shifts.noPumps")}</h2>
          </div>
        ) : (
          <div className="pick-board">
            {pumps.map((pump) => {
              const mine = nozzles.filter((n) => n.pumpId === pump.id);
              const held = mine.filter((n) => nozzleBusy[n.id]);
              return (
                <div
                  key={pump.id}
                  className={`pick-card${held.length ? " pick-card--held" : ""}`}
                >
                  <div className="pick-card__head">
                    <span className="pick-card__name">
                      <PumpIcon size={16} />
                      {pump.name}
                    </span>
                    <span className={`tag${held.length ? "" : " green"}`}>
                      {held.length ? t("shifts.busy") : t("shifts.free")}
                    </span>
                  </div>
                  {mine.map((nozzle) => {
                    const busyHere = nozzleBusy[nozzle.id];
                    const checked = picked.includes(nozzle.id);
                    return (
                      <button
                        key={nozzle.id}
                        type="button"
                        className={`nozzle-row${checked ? " selected" : ""}${
                          busyHere ? " busy" : ""
                        }`}
                        disabled={!!busyHere || busy}
                        aria-pressed={checked}
                        onClick={() => toggle(nozzle.id)}
                      >
                        <span
                          className={`fuel-dot fuel-dot--${fuelClass(nozzle.fuelType)}`}
                        />
                        <span className="nozzle-row__body">
                          <span className="nozzle-row__title">
                            {nozzle.name}
                            <span className="muted">{nozzle.fuelType}</span>
                          </span>
                          <span className="nozzle-row__sub">
                            {busyHere
                              ? `${t("shifts.heldBy")} ${
                                  busyHere.operator || ANONYMOUS_OPERATOR
                                }`
                              : `${t("shifts.openingReading")} · ${money(
                                  nozzle.lastReading
                                )}`}
                          </span>
                        </span>
                        <span className="nozzle-row__check" aria-hidden="true">
                          {checked && <CheckIcon size={13} />}
                        </span>
                      </button>
                    );
                  })}
                </div>
              );
            })}
          </div>
        )}

        <ActionBar>
          <button
            type="button"
            className="cta"
            disabled={busy || picked.length === 0}
            onClick={start}
          >
            {busy
              ? t("shifts.starting")
              : tn(picked.length, "shifts.startOnOne", "shifts.startOn")}
          </button>
        </ActionBar>
      </div>
    </>
  );
}
