import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../state/AuthContext.jsx";
import { useLanguage } from "../state/LanguageContext.jsx";
import { listCustomers, listShifts } from "../lib/api";
import { formatStamp, litres, money, todayISO } from "../lib/format";
import { SHIFT_STATUS, shiftTotals } from "../lib/shiftMath";
import { shiftPaths } from "../pages/shifts/paths.js";
import { Card } from "./Card.jsx";
import { Notice, Stat } from "./ui.jsx";
import Skeleton from "./Skeleton.jsx";
import StationScene from "./StationScene.jsx";
import {
  ChevronIcon,
  EyeIcon,
  EyeOffIcon,
  PlusIcon,
  RefreshIcon,
  ShiftIcon,
  StationIcon,
  StoreIcon,
  WalletIcon,
} from "./icons.jsx";

/**
 * A role's landing screen, drawn like a dealer-app home: the dealership
 * identity card, a sky-blue balance card with today's sales and a per-
 * segment breakdown, one featured service card whose options open as a
 * 2×2 tile grid, a Quick Actions row, and a Business Snapshot strip.
 *
 * Every tile is a real destination on its existing route. The tile that
 * points at the current home route is a button rather than a link to
 * itself: it opens the role's full dashboard in place; all other tiles
 * keep their original routes and role protections.
 *
 * Figures are for the selected station and use only data the signed-in
 * role may already read. Attendants see only their own shifts and never
 * load customer balances; the owner’s all-station overview remains a tap away.
 */

/** Decorative tone per destination label — colour is never the only cue. */
const TILE_TONE = {
  "shifts.startShift": "accent",
  "nav.shifts": "neutral",
  "nav.today": "accent",
  "nav.overview": "accent",
  "nav.dailyLedger": "purple",
  "nav.reports": "blue",
  "nav.history": "red",
  "nav.groundStock": "green",
  "nav.creditCustomers": "amber",
  "nav.pumpsRates": "blue",
  "nav.staffAccess": "purple",
  "nav.account": "neutral",
};

/** One-line subtitles for the featured card's option tiles. */
const TILE_BODY = {
  "shifts.startShift": "home.startShiftBody",
  "nav.shifts": "home.allShiftsBody",
  "nav.today": "home.todayBody",
  "nav.overview": "home.overviewBody",
  "nav.dailyLedger": "home.ledgerBody",
  "nav.reports": "home.reportsBody",
  "nav.history": "home.historyBody",
};

function OptionTile({ item, isHome, onOpenHome, primary, stationTarget }) {
  const { t } = useLanguage();
  const Icon = item.Icon;
  const tone = TILE_TONE[item.label] || "neutral";
  const contents = (
    <>
      <span
        className={`service-tile__icon service-tile__icon--${tone}`}
        aria-hidden="true"
      >
        <Icon size={21} style={{ color: "inherit" }} />
      </span>
      <span className="service-tile__text">
        <span className="service-tile__label">{t(item.label)}</span>
        {TILE_BODY[item.label] && (
          <span className="service-tile__body">{t(TILE_BODY[item.label])}</span>
        )}
      </span>
    </>
  );
  const cls = `service-tile service-tile--option${primary ? " service-tile--primary" : ""}`;
  return (
    <li className="service-grid__item">
      {isHome ? (
        <button type="button" className={cls} onClick={onOpenHome}>
          {contents}
        </button>
      ) : (
        <Link to={stationTarget(item.to)} className={cls}>
          {contents}
        </Link>
      )}
    </li>
  );
}

function QuickTile({ item, stationTarget }) {
  const { t } = useLanguage();
  const Icon = item.Icon;
  const tone = TILE_TONE[item.label] || "neutral";
  return (
    <li className="service-grid__item">
      <Link to={stationTarget(item.to)} className="service-tile service-tile--quick">
        <span
          className={`service-tile__icon service-tile__icon--${tone}`}
          aria-hidden="true"
        >
          <Icon size={22} style={{ color: "inherit" }} />
        </span>
        <span className="service-tile__label">{t(item.label)}</span>
      </Link>
    </li>
  );
}

export default function ServiceLauncher({
  tabs,
  more,
  startPath,
  homePath,
  onOpenHome,
  station,
  stationsLoading,
  stationsError,
  reloadStations,
  stationTarget,
  canSwitchStation,
  onOpenStation,
}) {
  const { t, tn } = useLanguage();
  const { profile } = useAuth();
  const role = profile.role;
  const canSeeMoney = role === "owner" || role === "manager";
  const paths = shiftPaths(role);

  // The owner’s existing overview masks financial figures by default on a
  // public forecourt. Keep that privacy behaviour on the new landing screen.
  const [showAmounts, setShowAmounts] = useState(role !== "owner");
  const [segmentsOpen, setSegmentsOpen] = useState(true);
  const [optionsOpen, setOptionsOpen] = useState(true);
  const [reloadTick, setReloadTick] = useState(0);
  const [data, setData] = useState({
    stationId: "",
    loading: false,
    error: false,
    summaries: [],
  });
  const stationId = station?.id || "";
  const stationName = station?.name || "";

  // Keep the identity card and figures in the same selected-station scope.
  // RLS still decides what is readable; attendants are additionally scoped
  // to their own shifts and never request the customer-credit ledger.
  useEffect(() => {
    if (!stationId || stationsLoading || stationsError) return undefined;
    let cancelled = false;
    setData({ stationId, loading: true, error: false, summaries: [] });
    (async () => {
      try {
        const [allShifts, customers] = await Promise.all([
          listShifts(stationId),
          canSeeMoney ? listCustomers(stationId) : Promise.resolve([]),
        ]);
        const shifts =
          role === "attendant"
            ? allShifts.filter(
                (shift) =>
                  shift.userId === profile.uid || shift.employeeId === profile.uid
              )
            : allShifts;
        const today = todayISO();
        const settled = shifts.filter(
          (shift) => shift.date === today && shift.status !== SHIFT_STATUS.OPEN
        );
        const totals = settled.map(shiftTotals);
        const openMine =
          role === "attendant"
            ? shifts.find((shift) => shift.status === SHIFT_STATUS.OPEN)
            : null;
        const summary = {
          id: stationId,
          name: stationName,
          sales: totals.reduce((sum, item) => sum + item.gross, 0),
          litres: totals.reduce((sum, item) => sum + item.totalLitres, 0),
          expenses: openMine ? shiftTotals(openMine).expensesTotal : 0,
          outstanding: customers.reduce(
            (sum, customer) => sum + Number(customer.outstandingBalance || 0),
            0
          ),
          pending: shifts.filter((shift) => shift.status === SHIFT_STATUS.PENDING_REVIEW)
            .length,
          shifts: settled.map((shift, index) => ({
            id: shift.id,
            label:
              role === "attendant"
                ? formatStamp(shift.startTime)
                : shift.employeeName || formatStamp(shift.startTime),
            gross: totals[index].gross,
          })),
        };
        if (!cancelled) {
          setData({ stationId, loading: false, error: false, summaries: [summary] });
        }
      } catch {
        if (!cancelled) {
          setData({ stationId, loading: false, error: true, summaries: [] });
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [
    stationId,
    stationName,
    role,
    profile.uid,
    canSeeMoney,
    reloadTick,
    stationsLoading,
    stationsError,
  ]);

  const reload = useCallback(() => {
    if (stationsError) reloadStations();
    else setReloadTick((n) => n + 1);
  }, [stationsError, reloadStations]);
  // Never flash the previous station's figures, or a misleading zero, while
  // the station or its summary is loading or when either request failed.
  const dataLoading =
    stationsLoading ||
    (!stationsError && !!stationId && (data.loading || data.stationId !== stationId));
  const dataError = Boolean(
    !dataLoading && (stationsError || (data.error && data.stationId === stationId))
  );
  const hasSummary =
    !dataLoading &&
    !dataError &&
    data.summaries.length > 0 &&
    data.stationId === stationId;

  const totals = useMemo(() => {
    const values = data.summaries;
    return {
      sales: values.reduce((sum, v) => sum + v.sales, 0),
      litres: values.reduce((sum, v) => sum + v.litres, 0),
      expenses: values.reduce((sum, v) => sum + v.expenses, 0),
      outstanding: values.reduce((sum, v) => sum + v.outstanding, 0),
      pending: values.reduce((sum, v) => sum + v.pending, 0),
    };
  }, [data.summaries]);

  // The owner's row leads to this station's register; for other roles the
  // rows lead to individual completed shifts. The station filter follows
  // each link just as it does on the shell's tabs.
  const segments = useMemo(() => {
    if (role === "owner") {
      return data.summaries.map((summary) => ({
        key: summary.id,
        label: summary.name,
        amount: summary.sales,
        to: stationTarget("/owner/shifts"),
      }));
    }
    return data.summaries.flatMap((summary) =>
      summary.shifts.map((shift) => ({
        key: shift.id,
        label: shift.label,
        amount: shift.gross,
        to: stationTarget(paths.detail(shift.id)),
      }))
    );
  }, [role, data.summaries, paths, stationTarget]);

  const segmentLabel =
    role === "owner"
      ? tn(segments.length, "home.segmentStationOne", "home.segmentStations")
      : tn(segments.length, "home.segmentShiftOne", "home.segmentShifts");

  // ---- destinations, grouped the dealer-app way -------------------------
  const destinations = [...tabs, ...more];
  const byTo = (to) => destinations.find((item) => item.to === to);
  const home = destinations.find((item) => item.to === homePath);
  const start = startPath
    ? { to: startPath, label: "shifts.startShift", Icon: PlusIcon }
    : null;

  const prefix = role === "owner" ? "/owner" : role === "manager" ? "/station" : "/today";
  const featured =
    role === "owner"
      ? [
          start,
          byTo(`${prefix}/shifts`),
          byTo(`${prefix}/ledger`),
          byTo(`${prefix}/reports`),
        ]
      : role === "manager"
        ? [start, home, byTo(`${prefix}/ledger`), byTo(`${prefix}/reports`)]
        : [start, home, byTo(`${prefix}/history`)];
  const quick =
    role === "owner"
      ? [
          byTo(`${prefix}/stock`),
          byTo(`${prefix}/credit`),
          byTo(`${prefix}/setup`),
          byTo(`${prefix}/staff`),
        ]
      : role === "manager"
        ? [byTo(`${prefix}/credit`), byTo(`${prefix}/stock`), byTo(`${prefix}/staff`)]
        : [byTo(`${prefix}/credit`), byTo(`${prefix}/stock`), byTo(`${prefix}/account`)];
  const featuredItems = featured.filter(Boolean);
  const quickItems = quick.filter(Boolean);

  const mask = (amount) => (showAmounts ? `₹ ${money(amount)}` : t("home.hiddenAmount"));
  const idName =
    stationName || (stationsLoading ? t("common.loading") : t("home.noStation"));

  return (
    <div className="service-launcher">
      {/* ---- dealership identity: the station this account works at ---- */}
      {canSwitchStation ? (
        <button
          type="button"
          className="buddy-id"
          onClick={onOpenStation}
          aria-haspopup="dialog"
          title={idName}
        >
          <span className="buddy-id__action">{t("chrome.switchStation")}: </span>
          <span className="buddy-id__icon" aria-hidden="true">
            <StoreIcon size={22} />
          </span>
          <span className="buddy-id__text">
            <span className="buddy-id__name">{idName}</span>
            <span className="buddy-id__sub">
              {t("chrome.signedInAs")} <span className="mono">{profile.username}</span>
            </span>
          </span>
          <span className="buddy-id__chevron" aria-hidden="true">
            <ChevronIcon size={16} />
          </span>
        </button>
      ) : (
        <div className="buddy-id buddy-id--static">
          <span className="buddy-id__icon" aria-hidden="true">
            <StoreIcon size={22} />
          </span>
          <span className="buddy-id__text">
            <span className="buddy-id__name">{idName}</span>
            <span className="buddy-id__sub">
              {t("chrome.signedInAs")} <span className="mono">{profile.username}</span>
            </span>
          </span>
        </div>
      )}

      {/* ---- the balance card: today's sales, expandable per segment ---- */}
      <section className="buddy-balance" aria-label={t("today.sales")}>
        <StationScene className="buddy-balance__scene" />
        <div className="buddy-balance__head">
          <span className="buddy-balance__chip" aria-hidden="true">
            <WalletIcon size={16} />
          </span>
          <span className="buddy-balance__label">{t("today.sales")}</span>
          <button
            type="button"
            className="buddy-balance__pill"
            onClick={() => setSegmentsOpen((open) => !open)}
            aria-expanded={segmentsOpen}
            disabled={!hasSummary}
          >
            {dataLoading ? t("common.loading") : hasSummary ? segmentLabel : "—"}
            <ChevronIcon size={13} />
          </button>
        </div>
        <div className="buddy-balance__amount-row">
          {dataLoading ? (
            <span
              className="skeleton buddy-balance__amount-skeleton"
              role="status"
              aria-label={t("common.loading")}
            />
          ) : (
            <span className="buddy-balance__amount">
              {hasSummary ? mask(totals.sales) : "—"}
            </span>
          )}
          <span className="buddy-balance__tools">
            <button
              type="button"
              className="buddy-balance__tool"
              onClick={() => setShowAmounts((show) => !show)}
              aria-pressed={showAmounts}
              aria-label={showAmounts ? t("home.hideAmount") : t("home.showAmount")}
              disabled={!hasSummary}
            >
              {showAmounts ? (
                <EyeOffIcon size={17} style={{ color: "inherit" }} />
              ) : (
                <EyeIcon size={17} style={{ color: "inherit" }} />
              )}
            </button>
            <button
              type="button"
              className="buddy-balance__tool"
              onClick={reload}
              aria-label={t("common.refresh")}
              disabled={dataLoading || (!stationId && !stationsError)}
            >
              <RefreshIcon size={16} style={{ color: "inherit" }} />
            </button>
          </span>
        </div>
        {dataError ? (
          <Notice kind="error">
            {t("home.snapshotError")}{" "}
            <button type="button" className="quiet notice__action" onClick={reload}>
              {t("common.retry")}
            </button>
          </Notice>
        ) : dataLoading ? (
          <Skeleton shape="row" count={1} />
        ) : !hasSummary ? (
          <p className="buddy-balance__empty">{t("home.noStation")}</p>
        ) : segmentsOpen ? (
          segments.length > 0 ? (
            <ul className="buddy-balance__rows">
              {segments.map((segment) => (
                <li key={segment.key}>
                  <Link to={segment.to} className="buddy-balance__row">
                    <span className="buddy-balance__row-label">{segment.label}</span>
                    <span className="mono">{mask(segment.amount)}</span>
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="buddy-balance__empty">{t("today.noCompletedSales")}</p>
          )
        ) : null}
      </section>

      {/* ---- the featured service: shifts, as a card of option tiles ---- */}
      <section className="buddy-service" aria-label={t("nav.shifts")}>
        <button
          type="button"
          className="buddy-service__head"
          onClick={() => setOptionsOpen((open) => !open)}
          aria-expanded={optionsOpen}
        >
          <span className="buddy-service__icon" aria-hidden="true">
            <ShiftIcon size={22} />
          </span>
          <span className="buddy-service__titles">
            <span className="buddy-service__title">{t("nav.shifts")}</span>
            <span className="buddy-service__sub">{t("home.shiftsCardBody")}</span>
          </span>
          <span className="buddy-service__count">
            {tn(featuredItems.length, "home.optionOne", "home.options")}
          </span>
          <span className="buddy-service__chevron" aria-hidden="true">
            <ChevronIcon size={16} />
          </span>
        </button>
        {optionsOpen && (
          <ul className="service-grid service-grid--options">
            {featuredItems.map((item) => (
              <OptionTile
                key={`${item.to}-${item.label}`}
                item={item}
                isHome={item.to === homePath}
                onOpenHome={onOpenHome}
                primary={item.label === "shifts.startShift"}
                stationTarget={stationTarget}
              />
            ))}
          </ul>
        )}
      </section>

      {/* ---- quick actions: the pastel icon row ---- */}
      <section className="buddy-section" aria-labelledby="buddy-quick-title">
        <div className="section-label">
          <h2 id="buddy-quick-title">{t("today.quickActions")}</h2>
        </div>
        <ul className="service-grid service-grid--quick">
          {quickItems.map((item) => (
            <QuickTile
              key={`${item.to}-${item.label}`}
              item={item}
              stationTarget={stationTarget}
            />
          ))}
        </ul>
      </section>

      {/* ---- the owner's dashboard: station cards and management ---- */}
      {role === "owner" && home && (
        <div className="service-grid service-grid--rows">
          <button
            type="button"
            className="service-tile service-tile--row"
            onClick={onOpenHome}
          >
            <span
              className="service-tile__icon service-tile__icon--accent"
              aria-hidden="true"
            >
              <StationIcon size={20} />
            </span>
            <span className="service-tile__text">
              <span className="service-tile__label">{t(home.label)}</span>
              <span className="service-tile__body">{t("home.overviewBody")}</span>
            </span>
            <ChevronIcon size={16} />
          </button>
        </div>
      )}

      {/* ---- business snapshot: the day's figures at a glance ---- */}
      <section className="buddy-section" aria-labelledby="buddy-snapshot-title">
        <div className="section-label">
          <h2 id="buddy-snapshot-title">
            {t(role === "attendant" ? "home.yourSnapshot" : "home.businessSnapshot")}
          </h2>
        </div>
        {dataLoading ? (
          <Skeleton shape="card" count={1} />
        ) : !hasSummary ? (
          <p className="buddy-section__empty">
            {t(dataError ? "home.snapshotUnavailable" : "home.noStation")}
          </p>
        ) : (
          <div
            className="quick-stat-row"
            tabIndex={0}
            role="region"
            aria-labelledby="buddy-snapshot-title"
          >
            <Card className="quick-stat">
              <Stat
                label={t("today.sales")}
                {...(showAmounts
                  ? { amount: totals.sales, format: money, prefix: "₹ " }
                  : { value: t("home.hiddenAmount") })}
              />
            </Card>
            <Card className="quick-stat">
              <Stat
                label={t("today.fuelDispensed")}
                amount={totals.litres}
                format={(n) => `${litres(n)} L`}
              />
            </Card>
            {canSeeMoney ? (
              <Card className="quick-stat">
                <Stat
                  label={t("owner.outstandingCredit")}
                  {...(showAmounts
                    ? { amount: totals.outstanding, format: money, prefix: "₹ " }
                    : { value: t("home.hiddenAmount") })}
                />
              </Card>
            ) : (
              <Card className="quick-stat">
                <Stat
                  label={t("today.expensesSoFar")}
                  {...(showAmounts
                    ? {
                        amount: totals.expenses,
                        format: money,
                        prefix: "₹ ",
                        tone: totals.expenses > 0 ? "neg" : "",
                      }
                    : { value: t("home.hiddenAmount") })}
                />
              </Card>
            )}
            {canSeeMoney && (
              <Card className="quick-stat">
                <Stat
                  label={t("shifts.pendingReview")}
                  amount={totals.pending}
                  format={(n) => `${Math.round(n)}`}
                />
              </Card>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
