import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Navigate, useNavigate, useSearchParams } from "react-router-dom";
import { ScreenHeader } from "../../components/Layout.jsx";
import { Notice } from "../../components/ui.jsx";
import { Card } from "../../components/Card.jsx";
import { Chip, ChipRow } from "../../components/Chip.jsx";
import ListRow from "../../components/ListRow.jsx";
import StickyCta from "../../components/StickyCta.jsx";
import Skeleton from "../../components/Skeleton.jsx";
import EmptyState from "../../components/EmptyState.jsx";
import Sheet from "../../components/Sheet.jsx";
import { CheckIcon, PlusIcon, PumpIcon } from "../../components/icons.jsx";
import { useAuth } from "../../state/AuthContext.jsx";
import { useStation } from "../../state/useStation.js";
import {
  getPrices,
  listNozzleOccupancy,
  listPumps,
  listShifts,
  listStaff,
  openShift,
  readableError,
} from "../../lib/api";
import { money, num } from "../../lib/format";
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
 * The forecourt as a menu: fuel chips filter the board, each pump is a
 * section, each nozzle a chunky tile with its fuel colour, price and the
 * opening reading it will start from. Picking tiles fills the cart — the
 * sticky bar counts them — and one Start button fires the same open_shift
 * call as always.
 *
 * A taken nozzle stays fully readable but untappable, with who-agnostic
 * wording; never a greyed-out mystery tile. Managers and owners additionally
 * choose who the shift is for, from their roster in a sheet — attendants
 * never see that picker, and never see anyone else's name anywhere here.
 *
 * Serves the attendant's `/today/start` and (for parity with the old single
 * page, where the button appeared for every role) the manager's and owner's
 * `/shifts/start` and `/start`.
 */
export default function StartShift() {
  const { t, tn } = useLanguage();
  const { profile } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { station, stationId, loading: stationsLoading } = useStation();
  const paths = shiftPaths(profile.role);

  const [shifts, setShifts] = useState([]);
  const [pumps, setPumps] = useState([]);
  const [nozzles, setNozzles] = useState([]);
  const [prices, setPrices] = useState({});
  const [busyIds, setBusyIds] = useState(null);
  const [staff, setStaff] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [picked, setPicked] = useState([]);
  // The fuel filter starts from the chip the attendant tapped on Today —
  // "MS" from there lands here with MS already selected.
  const [fuelFilter, setFuelFilter] = useState(searchParams.get("fuel") || "all");
  // Managers and owners may start the shift for someone else; null means
  // the person tapping the button is the one working it.
  const [employee, setEmployee] = useState(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [staffQuery, setStaffQuery] = useState("");

  const isAttendant = profile.role === "attendant";
  // Roster lookups need the profile, but its identity must not retrigger
  // the load effect — providers hand out fresh objects on every render.
  const profileRef = useRef(profile);
  profileRef.current = profile;

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
    // Prices are decoration on the tiles, not a gate on starting: if they
    // cannot be read, the picker works without them.
    try {
      const rows = await getPrices(stationId);
      const latest = new Map();
      rows.forEach((row) => {
        if (!latest.has(row.fuelType)) latest.set(row.fuelType, row.price);
      });
      setPrices(Object.fromEntries(latest));
    } catch {
      setPrices({});
    }
    // The roster is only for the who-is-working picker, and only managers
    // and owners ever see it.
    if (!isAttendant) {
      try {
        setStaff(await listStaff(profileRef.current));
      } catch {
        setStaff([]);
      }
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

  // The fuel chips come from the station's own nozzles, so the board never
  // offers a fuel it cannot pour.
  const fuels = [...new Set(nozzles.map((n) => n.fuelType))];
  const activeFuel = fuels.includes(fuelFilter) ? fuelFilter : "all";
  const visibleNozzles =
    activeFuel === "all" ? nozzles : nozzles.filter((n) => n.fuelType === activeFuel);

  const toggle = (nozzleId) => {
    setPicked((current) =>
      current.includes(nozzleId)
        ? current.filter((id) => id !== nozzleId)
        : [...current, nozzleId]
    );
  };

  const selectAllFree = (nozzleIds) => {
    setPicked((current) => [...new Set([...current, ...nozzleIds])]);
  };

  const workingName = employee ? employee.name : profile.name;

  const start = async () => {
    if (busy || picked.length === 0) return;
    setBusy(true);
    setError("");
    try {
      const { shiftId } = await openShift(stationId, {
        employeeName: workingName,
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
        <ScreenHeader title={t("shifts.startShift")} back={paths.home} />
        <div className="content start-shift">
          <Skeleton shape="card" count={2} />
        </div>
      </>
    );
  }

  const staffMatches = staff.filter((person) =>
    person.name.toLowerCase().includes(staffQuery.trim().toLowerCase())
  );

  return (
    <>
      <ScreenHeader
        title={t("shifts.startShift")}
        sub={`${station ? station.name : ""}${
          station ? " · " : ""
        }${t("shifts.startNote")}`}
        back={paths.home}
      />
      <div className="content start-shift">
        {error && (
          <Notice kind="error">
            {error}{" "}
            <button type="button" className="quiet notice__action" onClick={load}>
              {t("common.retry")}
            </button>
          </Notice>
        )}

        {pumps.length === 0 ? (
          <Card>
            <EmptyState
              icon={PumpIcon}
              headline={t("shifts.noPumps")}
              actionLabel={profile.role === "owner" ? t("setup.goSetup") : undefined}
              actionTo={profile.role === "owner" ? "/setup" : undefined}
            />
          </Card>
        ) : (
          <>
            {/* The fuel filter — chips, not a dropdown, because this is a
                two-second decision made standing up. */}
            {fuels.length > 1 && (
              <ChipRow label={t("shifts.filterFuel")}>
                <Chip
                  label={t("common.all")}
                  selected={activeFuel === "all"}
                  onClick={() => setFuelFilter("all")}
                />
                {fuels.map((fuel) => (
                  <Chip
                    key={fuel}
                    label={fuel}
                    selected={activeFuel === fuel}
                    onClick={() => setFuelFilter(fuel)}
                  />
                ))}
              </ChipRow>
            )}

            {/* Managers and owners: whose shift is this? A row that opens
                the roster in a sheet. */}
            {!isAttendant && (
              <ListRow
                avatar={workingName}
                title={workingName}
                subtitle={t("shifts.whoIsWorking")}
                onClick={() => setSheetOpen(true)}
                aria-haspopup="dialog"
              />
            )}

            {pumps.map((pump) => {
              const mine = visibleNozzles.filter((n) => n.pumpId === pump.id);
              if (mine.length === 0) return null;
              const freeHere = mine.filter((n) => !nozzleBusy[n.id]);
              return (
                <section key={pump.id} className="pump-group" aria-label={pump.name}>
                  <div className="pump-group__head">
                    <h3 className="pump-group__name">
                      <PumpIcon size={15} />
                      {pump.name}
                    </h3>
                    <span className={`tag${freeHere.length ? " green" : ""}`}>
                      {freeHere.length
                        ? `${num(freeHere.length)} ${t("shifts.free").toLowerCase()}`
                        : t("shifts.busy")}
                    </span>
                    {freeHere.length > 0 && (
                      <button
                        type="button"
                        className="pump-group__select"
                        onClick={() => selectAllFree(freeHere.map((n) => n.id))}
                      >
                        {t("shifts.selectAllFree")}
                      </button>
                    )}
                  </div>
                  <div className="nozzle-grid">
                    {mine.map((nozzle) => {
                      const busyHere = nozzleBusy[nozzle.id];
                      const checked = picked.includes(nozzle.id);
                      const price = prices[nozzle.fuelType];
                      return (
                        <button
                          key={nozzle.id}
                          type="button"
                          className={`nozzle-row nozzle-row--tile${checked ? " selected" : ""}${
                            busyHere ? " busy" : ""
                          }`}
                          disabled={!!busyHere || busy}
                          aria-pressed={checked}
                          aria-label={`${nozzle.name} · ${nozzle.fuelType} · ${
                            busyHere ? t("shifts.busy") : t("shifts.free")
                          }`}
                          onClick={() => toggle(nozzle.id)}
                        >
                          <span className="nozzle-row__body">
                            <span className="nozzle-row__title">
                              {nozzle.name}
                              <span
                                className={`fuel-tag fuel-tag--${fuelClass(nozzle.fuelType)}`}
                              >
                                {nozzle.fuelType}
                              </span>
                              <span
                                className={`nozzle-row__state${
                                  busyHere ? " nozzle-row__state--busy" : ""
                                }`}
                              >
                                {busyHere ? t("shifts.busy") : t("shifts.free")}
                              </span>
                            </span>
                            <span className="nozzle-row__sub">
                              {busyHere
                                ? `${t("shifts.heldBy")} ${
                                    busyHere.operator || ANONYMOUS_OPERATOR
                                  }`
                                : `${t("shifts.openingReading")} · ${money(nozzle.lastReading)}`}
                            </span>
                            {!busyHere && price != null && (
                              <span className="nozzle-row__price">{money(price)}/L</span>
                            )}
                          </span>
                          {checked ? (
                            <span className="nozzle-row__check" aria-hidden="true">
                              <CheckIcon size={14} />
                            </span>
                          ) : (
                            <span className="nozzle-row__add" aria-hidden="true">
                              <PlusIcon size={14} />
                            </span>
                          )}
                        </button>
                      );
                    })}
                  </div>
                </section>
              );
            })}

            <StickyCta
              liveSummary
              summary={tn(picked.length, "shifts.selectedOne", "shifts.selectedCount")}
              hint={picked.length === 0 ? t("shifts.startNote") : undefined}
              ctaLabel={
                busy
                  ? t("shifts.starting")
                  : tn(picked.length, "shifts.startOnOne", "shifts.startOn")
              }
              disabled={picked.length === 0}
              onCta={start}
              busy={busy}
            />
          </>
        )}
      </div>

      <Sheet
        open={sheetOpen}
        onClose={() => setSheetOpen(false)}
        title={t("shifts.whoIsWorking")}
      >
        <div className="sheet-search">
          <input
            type="search"
            value={staffQuery}
            onChange={(event) => setStaffQuery(event.target.value)}
            placeholder={t("common.search")}
            aria-label={t("common.search")}
          />
        </div>
        <div className="stack">
          <ListRow
            avatar={profile.name}
            title={profile.name}
            subtitle={t("shifts.yourself")}
            chevron={false}
            aria-pressed={employee === null}
            onClick={() => {
              setEmployee(null);
              setSheetOpen(false);
            }}
            trailing={
              employee === null ? <CheckIcon size={18} className="sheet-check" /> : null
            }
          />
          {staffMatches.map((person) => (
            <ListRow
              key={person.id}
              avatar={person.name}
              title={person.name}
              subtitle={t(`role.${person.role}`)}
              chevron={false}
              aria-pressed={employee?.id === person.id}
              onClick={() => {
                setEmployee(person);
                setSheetOpen(false);
              }}
              trailing={
                employee?.id === person.id ? (
                  <CheckIcon size={18} className="sheet-check" />
                ) : null
              }
            />
          ))}
        </div>
      </Sheet>
    </>
  );
}
