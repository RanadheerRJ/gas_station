import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ScreenHeader } from "../components/Layout.jsx";
import { Notice, Stat } from "../components/ui.jsx";
import { LoadingPanels } from "../components/motion.jsx";
import { ChevronIcon, PlusIcon } from "../components/icons.jsx";
import Sheet from "../components/Sheet.jsx";
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
  }, [stations]);

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
      <div className="content stack">
        {error && <Notice kind="error">{error}</Notice>}

        {loading ? (
          <LoadingPanels count={2} lines={3} label={t("common.loading")} />
        ) : stations.length === 0 ? (
          <div className="empty-card">
            <h2>{t("owner.noStations")}</h2>
          </div>
        ) : (
          <>
            {/* ---- the group's day ---- */}
            <section className="card stat-strip stat-strip--hero">
              <Stat
                label={t("owner.fuelSales")}
                amount={totals.sales}
                format={money}
                prefix="₹ "
              />
              <Stat
                label={t("owner.litresSold")}
                amount={totals.litres}
                format={(n) => `${money(n)} L`}
              />
              <Stat
                label={t("owner.cashVariance")}
                amount={totals.variance}
                format={money}
                prefix="₹ "
                tone={varianceTone(totals.variance)}
              />
              <Stat
                label={t("owner.outstandingCredit")}
                amount={totals.outstanding}
                format={money}
                prefix="₹ "
                tone={totals.outstanding > 0 ? "neg" : "pos"}
              />
            </section>

            {totals.pending > 0 && (
              <Notice>
                {tn(totals.pending, "owner.pendingNoticeOne", "owner.pendingNotice")}
              </Notice>
            )}

            {/* ---- one card per station ---- */}
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
                          {summary ? `₹ ${money(summary.sales)}` : "—"}
                        </span>
                      </div>

                      <div className="station-card__meta">
                        {summary?.openShifts > 0 ? (
                          <span className="tag">
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
                      {stationRef.state === "archived" ? (
                        <button
                          type="button"
                          className="quiet small"
                          disabled={busy}
                          onClick={() => changeStationState(stationRef, "active")}
                        >
                          {t("owner.reopen")}
                        </button>
                      ) : (
                        <button
                          type="button"
                          className="quiet small"
                          onClick={() => setArchiving(stationRef)}
                        >
                          {t("owner.archive")}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}
      </div>

      {/* ---- add a station ---- */}
      <Sheet
        open={showAdd}
        onClose={() => setShowAdd(false)}
        title={t("owner.addStation")}
      >
        <form className="stack" style={{ gap: 14 }} onSubmit={submitStation}>
          <label className="field">
            <span>{t("owner.stationName")}</span>
            <input
              value={form.name}
              onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
              placeholder="City Centre Filling Station"
            />
          </label>
          <label className="field">
            <span>{t("owner.address")}</span>
            <input
              value={form.address}
              onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
              placeholder="Beside RTO Office, Karimnagar"
            />
          </label>
          <button
            className="cta"
            type="submit"
            disabled={busy || !form.name.trim() || !form.address.trim()}
          >
            {busy ? t("owner.adding") : t("owner.addStation")}
          </button>
        </form>
      </Sheet>

      {/* ---- archive confirmation ---- */}
      <Sheet
        open={!!archiving}
        onClose={() => setArchiving(null)}
        title={t("owner.archiveTitle", { name: archiving?.name || "" })}
      >
        <div className="stack" style={{ gap: 14 }}>
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
    </>
  );
}
