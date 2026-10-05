import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ScreenHeader } from "../../components/Layout.jsx";
import { Notice, Stat } from "../../components/ui.jsx";
import { LoadingPanels } from "../../components/motion.jsx";
import { ChevronIcon, PlusIcon } from "../../components/icons.jsx";
import StationFilter from "../../components/StationFilter.jsx";
import ReportSheet from "../../components/ReportSheet.jsx";
import Sheet from "../../components/Sheet.jsx";
import { useAuth } from "../../state/AuthContext.jsx";
import { useStation } from "../../state/useStation.js";
import { useRunner } from "../../state/useRunner.js";
import {
  createCustomer,
  listCustomerDirectory,
  listCustomers,
  readableError,
  restoreCustomer,
} from "../../lib/api";
import { money } from "../../lib/format";
import { creditReport } from "../../lib/export.js";
import { useLanguage } from "../../state/LanguageContext.jsx";
export function creditBase(role) {
  return role === "owner" ? "/owner/credit" : "/station/credit";
}
export default function CreditList() {
  const { t } = useLanguage();
  const { profile } = useAuth();
  const {
    stations,
    station,
    stationId,
    setStation,
    link,
    loading: stationsLoading,
  } = useStation();
  const base = creditBase(profile.role);
  const attendant = profile.role === "attendant";
  const [customers, setCustomers] = useState([]),
    [loading, setLoading] = useState(true),
    [error, setError] = useState("");
  const [filter, setFilter] = useState("all"),
    [search, setSearch] = useState(""),
    [addOpen, setAddOpen] = useState(false),
    [newCustomer, setNewCustomer] = useState({ name: "", phone: "" });
  const load = useCallback(async () => {
    if (!stationId) return;
    setLoading(true);
    try {
      const rows = attendant
        ? await listCustomerDirectory(stationId)
        : await listCustomers(stationId);
      setCustomers(
        rows.sort(
          (a, b) => Number(b.outstandingBalance || 0) - Number(a.outstandingBalance || 0)
        )
      );
      setError("");
    } catch (e) {
      setError(readableError(e));
    } finally {
      setLoading(false);
    }
  }, [attendant, stationId]);
  useEffect(() => {
    load();
  }, [load]);
  const [run, busy, runError] = useRunner(load);
  const visible = useMemo(
    () =>
      customers.filter((c) => {
        const archived = Boolean(c.archivedAt);
        const bal = Number(c.outstandingBalance || 0);
        const q = search.trim().toLowerCase();
        return (
          ((filter === "all" && !archived) ||
            (filter === "outstanding" && !archived && bal > 0) ||
            (filter === "settled" && !archived && bal <= 0) ||
            (filter === "archived" && archived)) &&
          (!q || `${c.name} ${c.phone}`.toLowerCase().includes(q))
        );
      }),
    [customers, filter, search]
  );
  const active = customers.filter((c) => !c.archivedAt),
    total = active.reduce((s, c) => s + Number(c.outstandingBalance || 0), 0),
    settled = active.filter((c) => Number(c.outstandingBalance || 0) <= 0).length,
    archivedTotal = customers
      .filter((c) => c.archivedAt)
      .reduce((s, c) => s + Number(c.outstandingBalance || 0), 0);
  const buildReport = useCallback(
    (range) =>
      creditReport({ customers: visible, range, stationName: station?.name || "" }),
    [visible, station]
  );
  const add = async (e) => {
    e.preventDefault();
    if (
      await run(() =>
        createCustomer(stationId, {
          name: newCustomer.name.trim(),
          phone: newCustomer.phone.trim(),
        })
      )
    ) {
      setNewCustomer({ name: "", phone: "" });
      setAddOpen(false);
    }
  };
  const restore = async (id) => {
    if (await run(() => restoreCustomer(id))) setFilter("all");
  };
  if (stationsLoading)
    return (
      <>
        <ScreenHeader title={t("credit.title")} />
        <div className="content">
          <LoadingPanels count={1} lines={2} label={t("common.loading")} />
        </div>
      </>
    );
  return (
    <>
      <ScreenHeader
        title={t("credit.title")}
        sub={station?.name}
        filter={
          <StationFilter stations={stations} value={stationId} onChange={setStation} />
        }
        actions={
          <div className="credit-actions">
            {!attendant && (
              <ReportSheet
                report="credit"
                title={t("credit.reportExport")}
                stationName={station?.name || ""}
                buildReport={buildReport}
              />
            )}
            <button
              type="button"
              className="tool-btn tool-btn--primary"
              onClick={() => setAddOpen(true)}
            >
              <PlusIcon size={16} />
              {t("credit.addCustomer")}
            </button>
          </div>
        }
      />
      <div className="content stack">
        {(error || runError) && <Notice kind="error">{error || runError}</Notice>}
        {loading ? (
          <LoadingPanels count={3} lines={2} label={t("common.loading")} />
        ) : (
          <>
            {!attendant && (
              <>
                <section className="card stat-strip">
                  <Stat
                    label={t("credit.totalOutstanding")}
                    amount={total}
                    format={money}
                    prefix="₹ "
                    tone={total > 0 ? "neg" : "pos"}
                  />
                  <Stat
                    label={t("credit.customers")}
                    amount={active.length}
                    format={(n) => String(Math.round(n))}
                  />
                  <Stat
                    label={t("credit.fullySettled")}
                    amount={settled}
                    format={(n) => String(Math.round(n))}
                    tone="pos"
                  />
                </section>
                {archivedTotal > 0 && (
                  <div className="muted small">
                    {t("credit.archivedOutstanding")}:{" "}
                    <b className="neg">₹ {money(archivedTotal)}</b>
                  </div>
                )}
              </>
            )}
            {!attendant && (
              <div className="credit-filters">
                <input
                  aria-label={t("credit.search")}
                  placeholder={t("credit.search")}
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
                <div className="filter-chips">
                  {[
                    ["all", "credit.all"],
                    ["outstanding", "credit.outstanding"],
                    ["settled", "credit.settled"],
                    ["archived", "credit.archived"],
                  ].map(([id, key]) => (
                    <button
                      key={id}
                      type="button"
                      className={filter === id ? "active" : ""}
                      onClick={() => setFilter(id)}
                    >
                      {t(key)}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {visible.length === 0 ? (
              <div className="empty-card">
                <h2>
                  {filter === "archived" ? t("credit.archivedEmpty") : t("credit.empty")}
                </h2>
              </div>
            ) : (
              <div className="customer-list">
                {visible.map((c) => {
                  const b = Number(c.outstandingBalance || 0);
                  const body = (
                    <>
                      <span className="customer-avatar">
                        {c.name?.trim()?.[0]?.toUpperCase() || "?"}
                      </span>
                      <span className="customer-main">
                        <b>{c.name}</b>
                        <span>{c.phone || "—"}</span>
                      </span>
                      {!attendant && (
                        <span className={`customer-balance ${b > 0 ? "neg" : "pos"}`}>
                          {b > 0 ? `₹ ${money(b)}` : t("credit.settled")}
                        </span>
                      )}
                      <ChevronIcon size={18} />
                    </>
                  );
                  return c.archivedAt ? (
                    <div className="customer-row" key={c.id}>
                      {body}
                      <span className="tag">{t("credit.archived")}</span>
                      <button
                        type="button"
                        className="small"
                        onClick={() => restore(c.id)}
                        disabled={busy}
                      >
                        {t("credit.restore")}
                      </button>
                    </div>
                  ) : attendant ? (
                    <div className="customer-row" key={c.id}>
                      {body}
                    </div>
                  ) : (
                    <Link
                      className="customer-row"
                      key={c.id}
                      to={link(`${base}/${c.id}`)}
                    >
                      {body}
                    </Link>
                  );
                })}
              </div>
            )}
          </>
        )}
      </div>
      <Sheet
        open={addOpen}
        onClose={() => setAddOpen(false)}
        title={t("credit.newCustomer")}
      >
        <form className="stack" onSubmit={add}>
          <label className="field">
            <span>{t("credit.customerName")}</span>
            <input
              autoFocus
              value={newCustomer.name}
              disabled={busy}
              onChange={(e) => setNewCustomer({ ...newCustomer, name: e.target.value })}
            />
          </label>
          <label className="field">
            <span>{t("common.phone")}</span>
            <input
              inputMode="tel"
              value={newCustomer.phone}
              disabled={busy}
              onChange={(e) => setNewCustomer({ ...newCustomer, phone: e.target.value })}
            />
          </label>
          <button className="cta" disabled={busy || !newCustomer.name.trim()}>
            {busy ? t("common.saving") : t("credit.addCustomer")}
          </button>
        </form>
      </Sheet>
    </>
  );
}
