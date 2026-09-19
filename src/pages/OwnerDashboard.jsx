import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { PageHeader } from "../components/Layout";
import { Empty, Field, Notice, Panel, Stat } from "../components/ui";
import { LoadingPanels } from "../components/motion.jsx";
import { useStations } from "../state/useStations";
import {
  addStation,
  setStationState,
  listCustomers,
  listShifts,
  readableError,
} from "../lib/api";
import { money, todayISO } from "../lib/format";
import { SHIFT_STATUS, shiftTotals, varianceTone } from "../lib/shiftMath";
import { useLanguage } from "../state/LanguageContext.jsx";

export default function OwnerDashboard() {
  const { t, tn } = useLanguage();
  const { stations, loading, reload } = useStations();
  const [summaries, setSummaries] = useState({});
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({ name: "", address: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [deleting, setDeleting] = useState(null);

  // Per-station roll-up: today’s sales, today’s cash, total outstanding credit.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const today = todayISO();
      const out = {};
      await Promise.all(
        stations.map(async (s) => {
          try {
            const [shifts, customers] = await Promise.all([
              listShifts(s.id),
              listCustomers(s.id),
            ]);
            const todays = shifts.filter(
              (sh) => sh.date === today && sh.status !== SHIFT_STATUS.OPEN
            );
            const totals = todays.map(shiftTotals);
            out[s.id] = {
              sales: totals.reduce((n, t) => n + t.gross, 0),
              litres: totals.reduce((n, t) => n + t.totalLitres, 0),
              cash: totals.reduce((n, t) => n + (t.declared ?? 0), 0),
              testing: totals.reduce((n, t) => n + t.testingTotal, 0),
              handover: totals.reduce((n, t) => n + t.handover, 0),
              pending: shifts.filter(
                (sh) =>
                  sh.status === SHIFT_STATUS.PENDING_REVIEW ||
                  sh.status === SHIFT_STATUS.REJECTED
              ).length,
              variance: totals.reduce((n, t) => n + (t.variance ?? 0), 0),
              outstanding: customers.reduce(
                (n, c) => n + Number(c.outstandingBalance || 0),
                0
              ),
              openShifts: shifts.filter((sh) => sh.status === "open"),
              closedToday: todays.length,
              approvedToday: todays.filter((sh) => sh.status === SHIFT_STATUS.APPROVED)
                .length,
            };
          } catch {
            out[s.id] = null;
          }
        })
      );
      if (!cancelled) setSummaries(out);
    })();
    return () => {
      cancelled = true;
    };
  }, [stations]);

  const totals = useMemo(() => {
    const vals = Object.values(summaries).filter(Boolean);
    return {
      sales: vals.reduce((n, v) => n + v.sales, 0),
      litres: vals.reduce((n, v) => n + v.litres, 0),
      cash: vals.reduce((n, v) => n + v.cash, 0),
      testing: vals.reduce((n, v) => n + v.testing, 0),
      handover: vals.reduce((n, v) => n + v.handover, 0),
      pending: vals.reduce((n, v) => n + v.pending, 0),
      variance: vals.reduce((n, v) => n + v.variance, 0),
      outstanding: vals.reduce((n, v) => n + v.outstanding, 0),
    };
  }, [summaries]);

  const submitStation = async (e) => {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      await addStation({ name: form.name.trim(), address: form.address.trim() });
      setForm({ name: "", address: "" });
      setShowAdd(false);
      await reload();
    } catch (err) {
      setError(readableError(err));
    } finally {
      setBusy(false);
    }
  };

  const changeStationState = async (station, state) => {
    setError("");
    setBusy(true);
    try {
      await setStationState(station.id, state);
      setDeleting(null);
      await reload();
    } catch (err) {
      setError(readableError(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PageHeader
        title={t("owner.allStations")}
        sub={t(stations.length === 1 ? "owner.stationCountOne" : "owner.stationCount", {
          count: stations.length,
          date: todayISO(),
        })}
      />
      <div className="content stack">
        <Panel title={t("owner.combinedToday")}>
          <div className="row" style={{ gap: 40 }}>
            {/* These figures move as shifts are approved through the day, so
                they count to the new value instead of snapping. */}
            <Stat label={t("owner.litresSold")} amount={totals.litres} format={money} />
            <Stat
              label={t("owner.fuelSales")}
              amount={totals.sales}
              format={money}
              prefix="₹ "
            />
            <Stat
              label={t("owner.testing")}
              amount={totals.testing}
              format={money}
              prefix="₹ "
            />
            <Stat
              label={t("owner.cashDeclared")}
              amount={totals.cash}
              format={money}
              prefix="₹ "
            />
            <Stat
              label={t("owner.cashToReceive")}
              amount={totals.handover}
              format={money}
              prefix="₹ "
              tone="pos"
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
          </div>
        </Panel>

        {totals.pending > 0 && (
          <Notice>
            {tn(totals.pending, "owner.pendingNoticeOne", "owner.pendingNotice")}
          </Notice>
        )}

        <Panel
          title={t("owner.stations")}
          flush
          actions={
            <button type="button" onClick={() => setShowAdd((v) => !v)}>
              {showAdd ? t("common.cancel") : t("owner.addStation")}
            </button>
          }
        >
          {showAdd && (
            <form
              className="stack"
              onSubmit={submitStation}
              style={{ padding: 14, borderBottom: "1px solid var(--hairline)" }}
            >
              <div className="form-grid">
                <Field label={t("owner.stationName")}>
                  <input
                    value={form.name}
                    onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                    placeholder="City Centre Filling Station"
                  />
                </Field>
                <Field label={t("owner.address")}>
                  <input
                    value={form.address}
                    onChange={(e) => setForm((f) => ({ ...f, address: e.target.value }))}
                    placeholder="Beside RTO Office, Karimnagar"
                  />
                </Field>
              </div>
              {error && <Notice kind="error">{error}</Notice>}
              <div>
                <button
                  className="primary"
                  type="submit"
                  disabled={busy || !form.name.trim() || !form.address.trim()}
                >
                  {busy ? t("owner.adding") : t("owner.addStation")}
                </button>
              </div>
            </form>
          )}

          {loading ? (
            <LoadingPanels count={2} lines={3} label={t("common.loading")} />
          ) : stations.length === 0 ? (
            <Empty>{t("owner.noStations")}</Empty>
          ) : (
            <table>
              <thead>
                <tr>
                  <th>{t("common.station")}</th>
                  <th className="num">{t("shifts.litres")}</th>
                  <th className="num">{t("owner.salesToday")}</th>
                  <th className="num">{t("shifts.variance")}</th>
                  <th className="num">{t("owner.outstandingCredit")}</th>
                  <th>{t("owner.shiftCol")}</th>
                  <th className="num" style={{ width: 150 }} />
                </tr>
              </thead>
              <tbody>
                {stations.map((s) => {
                  const sum = summaries[s.id];
                  return (
                    <tr key={s.id}>
                      <td>
                        <div style={{ fontWeight: 500 }}>
                          {s.name}
                          {s.state === "archived" && (
                            <span className="tag" style={{ marginLeft: 6 }}>
                              {t("owner.archived")}
                            </span>
                          )}
                        </div>
                        <div className="small muted">{s.address}</div>
                      </td>
                      <td className="num mono">{sum ? money(sum.litres) : "—"}</td>
                      <td className="num mono">{sum ? money(sum.sales) : "—"}</td>
                      <td
                        className="num mono"
                        style={{
                          color:
                            sum && varianceTone(sum.variance) === "neg"
                              ? "var(--rust)"
                              : "var(--green)",
                        }}
                      >
                        {sum ? money(sum.variance) : "—"}
                      </td>
                      <td className="num mono">{sum ? money(sum.outstanding) : "—"}</td>
                      <td>
                        {!sum ? (
                          <span className="muted small">—</span>
                        ) : sum.openShifts?.length ? (
                          <span className="tag">
                            {t("owner.openCount", { count: sum.openShifts.length })}
                          </span>
                        ) : sum.closedToday > 0 ? (
                          <span className="tag green">
                            {t("owner.closedCount", { count: sum.closedToday })}
                          </span>
                        ) : (
                          <span className="tag rust">{t("owner.noneToday")}</span>
                        )}
                        {sum?.pending > 0 && (
                          <span className="tag" style={{ marginLeft: 6 }}>
                            {t("owner.toReview", { count: sum.pending })}
                          </span>
                        )}
                      </td>
                      <td className="num">
                        <span
                          className="row"
                          style={{ gap: 10, justifyContent: "flex-end" }}
                        >
                          <Link className="small" to={`/owner/shifts?station=${s.id}`}>
                            Shifts
                          </Link>
                          {s.state === "archived" ? (
                            <button
                              type="button"
                              className="quiet"
                              disabled={busy}
                              onClick={() => changeStationState(s, "active")}
                            >
                              {t("owner.reopen")}
                            </button>
                          ) : (
                            <button
                              type="button"
                              className="quiet"
                              onClick={() => {
                                setError("");
                                setDeleting(deleting?.id === s.id ? null : s);
                              }}
                            >
                              {t("owner.archive")}
                            </button>
                          )}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr>
                  <td>{t("common.total")}</td>
                  <td className="num mono">{money(totals.litres)}</td>
                  <td className="num mono">{money(totals.sales)}</td>
                  <td className="num mono">{money(totals.variance)}</td>
                  <td className="num mono">{money(totals.outstanding)}</td>
                  <td colSpan={2} />
                </tr>
              </tfoot>
            </table>
          )}
        </Panel>
        {deleting && (
          <Panel title={t("owner.archiveTitle", { name: deleting.name })}>
            <div className="stack" style={{ gap: 10 }}>
              <Notice>{t("owner.archiveNotice")}</Notice>
              {error && <Notice kind="error">{error}</Notice>}
              <div className="row">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => changeStationState(deleting, "archived")}
                >
                  {busy
                    ? t("owner.archiving")
                    : t("owner.archiveAction", { name: deleting.name })}
                </button>
                <button type="button" onClick={() => setDeleting(null)} disabled={busy}>
                  {t("common.cancel")}
                </button>
              </div>
            </div>
          </Panel>
        )}
      </div>
    </>
  );
}
