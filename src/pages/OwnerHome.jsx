import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ScreenHeader } from "../components/Layout.jsx";
import { Notice } from "../components/ui.jsx";
import { Card } from "../components/Card.jsx";
import Skeleton from "../components/Skeleton.jsx";
import EmptyState from "../components/EmptyState.jsx";
import {
  ChartIcon,
  ChevronIcon,
  CreditIcon,
  EyeIcon,
  EyeOffIcon,
  LedgerIcon,
  PeopleIcon,
  PlusIcon,
  PumpIcon,
  RateIcon,
  RefreshIcon,
  ShiftIcon,
  TankIcon,
} from "../components/icons.jsx";
import { avatarHue, initials } from "../lib/avatar.js";
import Sheet from "../components/Sheet.jsx";
import ResetStationSheet from "../components/ResetStationSheet.jsx";
import OverflowMenu from "../components/OverflowMenu.jsx";
import { useStations } from "../state/useStations.js";
import { useRunner } from "../state/useRunner.js";
import { addStation, listCustomers, listShifts, setStationState } from "../lib/api";
import { money, todayISO } from "../lib/format";
import { SHIFT_STATUS, shiftTotals, varianceTone } from "../lib/shiftMath";
import { useLanguage } from "../state/LanguageContext.jsx";

/**
 * The owner's landing page: the group's day in one strip, then a card per
 * station — today's sales, what is running, what needs review — each tapping
 * through to that station's shifts, with its ledger and stock one link away.
 * An actual home screen, not a table.
 */
export default function OwnerHome() {
  const { t, tn } = useLanguage();
  const { stations, loading, reload } = useStations();

  const [summaries, setSummaries] = useState({});
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ name: "", address: "" });
  const [archiving, setArchiving] = useState(null);
  const [resettingStation, setResettingStation] = useState(null);
  // Banking-home behaviour: money figures start masked (a forecourt is a
  // public place), the eye unmasks them, and the hero's refresh re-reads.
  const [showAmounts, setShowAmounts] = useState(false);
  const [refreshTick, setRefreshTick] = useState(0);
  const [quickTab, setQuickTab] = useState("operations");

  // Per-station roll-up: today's sales, cash, open shifts, review queue.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const today = todayISO();
      const out = {};
      await Promise.all(
        stations.map(async (stationRef) => {
          try {
            const [shifts, customers] = await Promise.all([
              listShifts(stationRef.id),
              listCustomers(stationRef.id),
            ]);
            const todays = shifts.filter(
              (shift) => shift.date === today && shift.status !== SHIFT_STATUS.OPEN
            );
            const totals = todays.map(shiftTotals);
            out[stationRef.id] = {
              sales: totals.reduce((sum, x) => sum + x.gross, 0),
              litres: totals.reduce((sum, x) => sum + x.totalLitres, 0),
              variance: totals.reduce((sum, x) => sum + (x.variance ?? 0), 0),
              outstanding: customers.reduce(
                (sum, customer) => sum + Number(customer.outstandingBalance || 0),
                0
              ),
              openShifts: shifts.filter((shift) => shift.status === SHIFT_STATUS.OPEN)
                .length,
              closedToday: todays.length,
              pending: shifts.filter(
                (shift) =>
                  shift.status === SHIFT_STATUS.PENDING_REVIEW ||
                  shift.status === SHIFT_STATUS.REJECTED
              ).length,
            };
          } catch {
            out[stationRef.id] = null;
          }
        })
      );
      if (!cancelled) setSummaries(out);
    })();
    return () => {
      cancelled = true;
    };
  }, [stations, refreshTick]);

  const [run, busy, error] = useRunner(reload);

  const totals = useMemo(() => {
    const values = Object.values(summaries).filter(Boolean);
    return {
      sales: values.reduce((sum, v) => sum + v.sales, 0),
      litres: values.reduce((sum, v) => sum + v.litres, 0),
      variance: values.reduce((sum, v) => sum + v.variance, 0),
      outstanding: values.reduce((sum, v) => sum + v.outstanding, 0),
      pending: values.reduce((sum, v) => sum + v.pending, 0),
    };
  }, [summaries]);

  const submitStation = async (e) => {
    e.preventDefault();
    const ok = await run(async () => {
      await addStation({ name: form.name.trim(), address: form.address.trim() });
    });
    if (ok) {
      setForm({ name: "", address: "" });
      setShowAdd(false);
    }
  };

  const changeStationState = async (stationRef, state) => {
    const ok = await run(() => setStationState(stationRef.id, state));
    if (ok) setArchiving(null);
  };

  const quickGroups = {
    operations: [
      { to: "/owner/shifts/start", label: "shifts.startShift", Icon: PlusIcon },
      { to: "/owner/shifts", label: "nav.shifts", Icon: ShiftIcon },
      { to: "/owner/stock", label: "nav.groundStock", Icon: TankIcon },
      { to: "/owner/reports", label: "nav.reports", Icon: ChartIcon },
    ],
    money: [
      { to: "/owner/ledger", label: "nav.dailyLedger", Icon: LedgerIcon },
      { to: "/owner/credit", label: "nav.creditCustomers", Icon: CreditIcon },
      { to: "/owner/shifts", label: "owner.reviewShifts", Icon: ShiftIcon },
      { to: "/owner/reports", label: "nav.reports", Icon: ChartIcon },
    ],
    station: [
      { to: "/owner/setup", label: "nav.pumpsRates", Icon: RateIcon },
      { to: "/owner/staff", label: "nav.staffAccess", Icon: PeopleIcon },
    ],
  };
  const mask = (amount) => (showAmounts ? `₹ ${money(amount)}` : t("home.hiddenAmount"));

  return (
    <>
      <ScreenHeader
        title={t("owner.allStations")}
        sub={t(stations.length === 1 ? "owner.stationCountOne" : "owner.stationCount", {
          count: stations.length,
          date: todayISO(),
        })}
        actions={
          <button
            type="button"
            className="tool-btn tool-btn--primary"
            onClick={() => setShowAdd(true)}
          >
            <PlusIcon size={16} />
            {t("owner.addStation")}
          </button>
        }
      />
      <div className="content stack home-feed">
        {error && <Notice kind="error">{error}</Notice>}

        {loading ? (
          <Skeleton shape="card" count={3} />
        ) : stations.length === 0 ? (
          <Card>
            <EmptyState
              icon={PumpIcon}
              headline={t("owner.noStations")}
              actionLabel={t("owner.addStation")}
              onAction={() => setShowAdd(true)}
            />
          </Card>
        ) : (
          <>
            {/* ---- the group's day: a banking-style hero carousel. The big
                gradient card leads with today's combined sales (masked until
                the eye is tapped); the next cards peek in from the edge. ---- */}
            <div className="hero-carousel">
              <section className="hero-card" aria-label={t("owner.combinedToday")}>
                <div className="hero-card__top">
                  <span className="hero-card__eyebrow">{t("owner.combinedToday")}</span>
                  <button
                    type="button"
                    className="hero-card__icon-btn"
                    onClick={() => setShowAmounts((v) => !v)}
                    aria-pressed={showAmounts}
                    aria-label={showAmounts ? t("home.hideAmount") : t("home.showAmount")}
                  >
                    {showAmounts ? <EyeOffIcon size={19} /> : <EyeIcon size={19} />}
                  </button>
                </div>
                <span className="hero-card__label">{t("owner.fuelSales")}</span>
                <div className="hero-card__amount-row">
                  <span className="hero-card__amount">{mask(totals.sales)}</span>
                  <button
                    type="button"
                    className="hero-card__icon-btn"
                    onClick={() => setRefreshTick((n) => n + 1)}
                    aria-label={t("common.refresh")}
                  >
                    <RefreshIcon size={17} />
                  </button>
                </div>
                <span className="hero-card__meta">
                  {t("owner.litresSold")} · {money(totals.litres)} L ·{" "}
                  {t(
                    stations.length === 1
                      ? "owner.stationCountOne"
                      : "owner.stationCount",
                    { count: stations.length, date: todayISO() }
                  )}
                </span>
                <div className="hero-card__links">
                  <Link to="/owner/shifts">{t("nav.shifts")}</Link>
                  <Link to="/owner/ledger">{t("nav.dailyLedger")}</Link>
                </div>
              </section>

              <section className="hero-mini" aria-label={t("owner.outstandingCredit")}>
                <span className="hero-mini__label">{t("owner.outstandingCredit")}</span>
                <span className="hero-mini__amount">{mask(totals.outstanding)}</span>
                <p>{t("home.creditCardBody")}</p>
                <Link to="/owner/credit" className="primary-link">
                  {t("nav.creditCustomers")}
                </Link>
              </section>

              <section className="hero-mini" aria-label={t("owner.cashVariance")}>
                <span className="hero-mini__label">{t("owner.cashVariance")}</span>
                <span
                  className={`hero-mini__amount${
                    varianceTone(totals.variance) === "neg"
                      ? " hero-mini__amount--neg"
                      : varianceTone(totals.variance) === "pos"
                        ? " hero-mini__amount--pos"
                        : ""
                  }`}
                >
                  {mask(totals.variance)}
                </span>
                <p>{t("home.varianceCardBody")}</p>
                <Link to="/owner/reports" className="primary-link">
                  {t("nav.reports")}
                </Link>
              </section>
            </div>

            {totals.pending > 0 && (
              <Notice>
                {tn(totals.pending, "owner.pendingNoticeOne", "owner.pendingNotice")}{" "}
                <Link to="/owner/shifts" className="primary-link">
                  {t("owner.reviewShifts")}
                </Link>
              </Notice>
            )}

            {/* ---- quick actions: tabbed icon grid, banking-home style ---- */}
            <section aria-labelledby="quick-actions-title">
              <div className="section-label">
                <h2 id="quick-actions-title">{t("today.quickActions")}</h2>
              </div>
              <div
                className="home-tabs"
                role="tablist"
                aria-label={t("today.quickActions")}
              >
                {[
                  ["operations", t("home.operations")],
                  ["money", t("home.money")],
                  ["station", t("common.station")],
                ].map(([key, label]) => (
                  <button
                    key={key}
                    type="button"
                    role="tab"
                    aria-selected={quickTab === key}
                    className={`home-tab${quickTab === key ? " active" : ""}`}
                    onClick={() => setQuickTab(key)}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <div className="quick-grid">
                {quickGroups[quickTab].map(({ to, label, Icon }) => (
                  <Link key={`${to}-${label}`} to={to} className="quick-tile">
                    <span className="quick-tile__icon" aria-hidden="true">
                      <Icon size={23} />
                    </span>
                    <span>{t(label)}</span>
                  </Link>
                ))}
                {quickTab === "station" && (
                  <button
                    type="button"
                    className="quick-tile"
                    onClick={() => setShowAdd(true)}
                  >
                    <span className="quick-tile__icon" aria-hidden="true">
                      <PlusIcon size={23} />
                    </span>
                    <span>{t("owner.addStation")}</span>
                  </button>
                )}
              </div>
            </section>

            {/* ---- one card per station ---- */}
            <section aria-labelledby="stations-title">
              <div className="section-label">
                <h2 id="stations-title">{t("owner.stations")}</h2>
              </div>
              <div className="station-grid">
                {stations.map((stationRef) => {
                  const summary = summaries[stationRef.id];
                  return (
                    <div key={stationRef.id} className="station-card">
                      <Link
                        to={`/owner/shifts?station=${stationRef.id}`}
                        className="station-card__main"
                      >
                        <div className="station-card__head">
                          <span
                            className="station-card__avatar"
                            style={{ "--avatar-hue": avatarHue(stationRef.name) }}
                            aria-hidden="true"
                          >
                            {initials(stationRef.name)}
                          </span>
                          <div>
                            <div className="station-card__name">
                              {stationRef.name}
                              {stationRef.state === "archived" && (
                                <span className="tag">{t("owner.archived")}</span>
                              )}
                            </div>
                            <div className="small muted">{stationRef.address}</div>
                          </div>
                          <ChevronIcon size={17} />
                        </div>

                        <div className="station-card__figure">
                          <span className="k">{t("owner.salesToday")}</span>
                          <span className="v mono">
                            {summary ? mask(summary.sales) : "—"}
                          </span>
                        </div>

                        <div className="station-card__meta">
                          {summary?.openShifts > 0 ? (
                            <span className="tag tag--live">
                              <span className="live-dot" aria-hidden="true" />
                              {t("owner.openCount", { count: summary.openShifts })}
                            </span>
                          ) : summary?.closedToday > 0 ? (
                            <span className="tag green">
                              {t("owner.closedCount", { count: summary.closedToday })}
                            </span>
                          ) : (
                            <span className="tag rust">{t("owner.noneToday")}</span>
                          )}
                          {summary?.pending > 0 && (
                            <span className="tag">
                              {t("owner.toReview", { count: summary.pending })}
                            </span>
                          )}
                          {summary && varianceTone(summary.variance) === "neg" && (
                            <span className="tag rust">
                              {t("shifts.variance")} ₹ {money(summary.variance)}
                            </span>
                          )}
                        </div>
                      </Link>

                      <div className="station-card__links">
                        <Link
                          to={`/owner/ledger?station=${stationRef.id}`}
                          className="small primary-link"
                        >
                          {t("nav.dailyLedger")}
                        </Link>
                        <Link
                          to={`/owner/stock?station=${stationRef.id}`}
                          className="small primary-link"
                        >
                          {t("nav.groundStock")}
                        </Link>
                        {/* Archiving and resetting are rare and consequential, so they
                          sit behind a menu instead of next to the daily links. */}
                        <OverflowMenu
                          items={[
                            stationRef.state === "archived"
                              ? {
                                  key: "reopen",
                                  label: t("owner.reopen"),
                                  disabled: busy,
                                  onClick: () => changeStationState(stationRef, "active"),
                                }
                              : {
                                  key: "archive",
                                  label: t("owner.archive"),
                                  onClick: () => setArchiving(stationRef),
                                },
                            {
                              key: "reset",
                              label: t("station.resetShort"),
                              danger: true,
                              onClick: () => setResettingStation(stationRef),
                            },
                          ]}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>
          </>
        )}
      </div>

      {/* ---- add a station ---- */}
      <Sheet
        open={showAdd}
        onClose={() => setShowAdd(false)}
        title={t("owner.addStation")}
      >
        <form className="stack" onSubmit={submitStation}>
          <label className="field">
            <span>{t("owner.stationName")}</span>
            <input
              value={form.name}
              disabled={busy}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="City Centre Filling Station"
            />
          </label>
          <label className="field">
            <span>{t("owner.address")}</span>
            <input
              value={form.address}
              disabled={busy}
              onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
              placeholder="Beside RTO Office, Karimnagar"
            />
          </label>
          <div className="row">
            <button
              className="cta"
              type="submit"
              disabled={busy || !form.name.trim() || !form.address.trim()}
            >
              {busy ? t("owner.adding") : t("owner.addStation")}
            </button>
            <button type="button" disabled={busy} onClick={() => setShowAdd(false)}>
              {t("common.cancel")}
            </button>
          </div>
        </form>
      </Sheet>

      {/* ---- archive confirmation ---- */}
      <Sheet
        open={!!archiving}
        onClose={() => setArchiving(null)}
        title={t("owner.archiveTitle", { name: archiving?.name || "" })}
      >
        <div className="stack">
          <Notice>{t("owner.archiveNotice")}</Notice>
          <div className="row">
            <button
              type="button"
              className="cta"
              disabled={busy}
              onClick={() => changeStationState(archiving, "archived")}
            >
              {busy
                ? t("owner.archiving")
                : t("owner.archiveAction", { name: archiving?.name || "" })}
            </button>
            <button type="button" onClick={() => setArchiving(null)} disabled={busy}>
              {t("common.cancel")}
            </button>
          </div>
        </div>
      </Sheet>

      {/* ---- reset station data confirmation ---- */}
      <ResetStationSheet
        open={!!resettingStation}
        station={resettingStation}
        onClose={() => setResettingStation(null)}
        onDone={() => reload()}
      />
    </>
  );
}
