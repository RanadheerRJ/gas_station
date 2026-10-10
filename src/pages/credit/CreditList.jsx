import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ScreenHeader } from "../../components/Layout.jsx";
import { Notice } from "../../components/ui.jsx";
import { LoadingPanels, NumberRoll } from "../../components/motion.jsx";
import { ChevronIcon, CloseIcon, PlusIcon } from "../../components/icons.jsx";
import StationFilter from "../../components/StationFilter.jsx";
import ReportSheet from "../../components/ReportSheet.jsx";
import Sheet from "../../components/Sheet.jsx";
import CreditActivity from "./CreditActivity.jsx";
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
import { formatDayLabel, money } from "../../lib/format";
import { creditReport } from "../../lib/export.js";
import { useLanguage } from "../../state/LanguageContext.jsx";

export function creditBase(role) {
  return role === "owner" ? "/owner/credit" : "/station/credit";
}

const DAY_MS = 24 * 60 * 60 * 1000;

/** Whole days between an ISO date/timestamp and now; null when unknown. */
export function daysSince(value, now = new Date()) {
  if (!value) return null;
  const then = new Date(value);
  if (Number.isNaN(then.getTime())) return null;
  return Math.max(0, Math.floor((now.getTime() - then.getTime()) / DAY_MS));
}

/**
 * The last credit and the last payment on an account, read off the history
 * the list already loaded — no extra query per customer.
 */
export function lastMovement(customer) {
  const rows = customer.transactions || [];
  const latest = (type) =>
    rows.find((tx) => tx.type === type && tx.status !== "voided") || null;
  const credit = latest("credit");
  const payment = latest("payment");
  return { credit, payment };
}

/**
 * How overdue an account looks, from the history already on screen.
 *
 * An owner's real question about a credit book is never "what is the total" —
 * it is "who has owed me money the longest". A balance with no payment against
 * it for two months is a different problem from one taken yesterday, and until
 * now the list said nothing about the difference. Thresholds are deliberately
 * coarse (a month, two months) because this is a prompt to make a phone call,
 * not an accounting judgement.
 */
export function accountAge(customer, now = new Date()) {
  const balance = Number(customer.outstandingBalance || 0);
  if (balance <= 0) return { tone: null, days: null };
  const { credit, payment } = lastMovement(customer);
  const since =
    payment?.date || payment?.recordedAt || credit?.date || credit?.recordedAt;
  const days = daysSince(since, now);
  if (days === null) return { tone: null, days: null, paid: Boolean(payment) };
  const tone = days >= 60 ? "late" : days >= 30 ? "watch" : null;
  return { tone, days, paid: Boolean(payment) };
}

/**
 * The figures the header card states, computed once over the whole book.
 *
 * `concentration` is the share of the outstanding money held by the three
 * largest accounts. One number that says "most of what is owed sits with three
 * people" changes what an owner does next far more than a customer count does.
 */
export function creditInsights(customers, now = new Date()) {
  const active = customers.filter((c) => !c.archivedAt);
  const balances = active
    .map((c) => Number(c.outstandingBalance || 0))
    .filter((n) => n > 0)
    .sort((a, b) => b - a);
  const total = balances.reduce((sum, n) => sum + n, 0);
  const top = balances.slice(0, 3).reduce((sum, n) => sum + n, 0);
  const overdue = active.filter((c) => accountAge(c, now).tone === "late");
  return {
    total,
    customers: active.length,
    owing: balances.length,
    settled: active.length - balances.length,
    archivedTotal: customers
      .filter((c) => c.archivedAt)
      .reduce((sum, c) => sum + Number(c.outstandingBalance || 0), 0),
    topShare: total > 0 ? Math.round((top / total) * 100) : 0,
    topCount: Math.min(3, balances.length),
    overdue: overdue.length,
    largest: balances[0] || 0,
  };
}

export const SORTS = ["balance", "recent", "name"];

/** Order the visible rows. Default is biggest exposure first. */
export function sortCustomers(rows, sort) {
  const copy = [...rows];
  if (sort === "name")
    return copy.sort((a, b) =>
      String(a.name || "").localeCompare(String(b.name || ""), undefined, {
        sensitivity: "base",
      })
    );
  if (sort === "recent")
    return copy.sort((a, b) => {
      const at = (c) => {
        const { credit, payment } = lastMovement(c);
        const stamps = [
          credit?.recordedAt,
          credit?.date,
          payment?.recordedAt,
          payment?.date,
        ]
          .filter(Boolean)
          .map((d) => new Date(d).getTime())
          .filter((n) => !Number.isNaN(n));
        return stamps.length ? Math.max(...stamps) : 0;
      };
      return at(b) - at(a);
    });
  return copy.sort(
    (a, b) => Number(b.outstandingBalance || 0) - Number(a.outstandingBalance || 0)
  );
}

/** A stable colour per customer, so the same person looks the same every time. */
export function avatarHue(name) {
  const text = String(name || "");
  let hash = 0;
  for (let i = 0; i < text.length; i += 1) hash = (hash * 31 + text.charCodeAt(i)) % 360;
  return hash;
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
    [sort, setSort] = useState("balance"),
    [addOpen, setAddOpen] = useState(false),
    [newCustomer, setNewCustomer] = useState({ name: "", phone: "" }),
    [addedNotice, setAddedNotice] = useState("");

  const load = useCallback(async () => {
    if (!stationId) return;
    setLoading(true);
    try {
      const rows = attendant
        ? await listCustomerDirectory(stationId)
        : await listCustomers(stationId);
      setCustomers(rows);
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

  const insights = useMemo(() => creditInsights(customers), [customers]);

  /** Row counts per tab, so a chip states what is behind it before it is tapped. */
  const counts = useMemo(() => {
    const active = customers.filter((c) => !c.archivedAt);
    return {
      all: active.length,
      outstanding: active.filter((c) => Number(c.outstandingBalance || 0) > 0).length,
      settled: active.filter((c) => Number(c.outstandingBalance || 0) <= 0).length,
      archived: customers.filter((c) => c.archivedAt).length,
    };
  }, [customers]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    const matched = customers.filter((c) => {
      const archived = Boolean(c.archivedAt);
      const bal = Number(c.outstandingBalance || 0);
      return (
        ((filter === "all" && !archived) ||
          (filter === "outstanding" && !archived && bal > 0) ||
          (filter === "settled" && !archived && bal <= 0) ||
          (filter === "archived" && archived)) &&
        (!q || `${c.name} ${c.phone}`.toLowerCase().includes(q))
      );
    });
    return sortCustomers(matched, attendant ? "name" : sort);
  }, [attendant, customers, filter, search, sort]);

  const buildReport = useCallback(
    (range) =>
      creditReport({ customers: visible, range, stationName: station?.name || "" }),
    [visible, station]
  );

  const add = async (e) => {
    e.preventDefault();
    let saved = null;
    const ok = await run(async () => {
      saved = await createCustomer(stationId, {
        name: newCustomer.name.trim(),
        phone: newCustomer.phone.trim(),
      });
    });
    if (ok) {
      // The database reuses the existing account for a repeated name and
      // phone; say so instead of leaving the save silent.
      setAddedNotice(
        saved && saved.created === false ? t("credit.customerExistsNotice") : ""
      );
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

  const searching = search.trim().length > 0;

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
      <div className="content stack credit-screen">
        {(error || runError) && <Notice kind="error">{error || runError}</Notice>}
        {addedNotice && <Notice kind="attention">{addedNotice}</Notice>}
        {loading ? (
          <LoadingPanels count={3} lines={2} label={t("common.loading")} />
        ) : (
          <>
            {!attendant && <CreditHero insights={insights} t={t} />}
            {!attendant && <CreditActivity stationId={stationId} />}
            {attendant && <p className="muted small">{t("credit.attendantDirectory")}</p>}

            <div className="credit-toolbar">
              <div className="credit-search">
                <input
                  aria-label={t("credit.search")}
                  placeholder={t("credit.search")}
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
                {searching && (
                  <button
                    type="button"
                    className="credit-search__clear"
                    aria-label={t("credit.clearSearch")}
                    onClick={() => setSearch("")}
                  >
                    <CloseIcon size={14} />
                  </button>
                )}
              </div>
              {!attendant && (
                <>
                  <div
                    className="filter-chips credit-chips"
                    role="group"
                    aria-label={t("credit.filterStatus")}
                  >
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
                        aria-pressed={filter === id}
                        onClick={() => setFilter(id)}
                      >
                        {t(key)}
                        <span className="credit-chip__count">{counts[id]}</span>
                      </button>
                    ))}
                  </div>
                  <label className="field credit-sort">
                    <span>{t("credit.sortBy")}</span>
                    <select value={sort} onChange={(e) => setSort(e.target.value)}>
                      <option value="balance">{t("credit.sortBalance")}</option>
                      <option value="recent">{t("credit.sortRecent")}</option>
                      <option value="name">{t("credit.sortName")}</option>
                    </select>
                  </label>
                </>
              )}
            </div>

            {visible.length === 0 ? (
              <div className="empty-card">
                <h2>
                  {searching
                    ? t("credit.searchEmpty", { query: search.trim() })
                    : filter === "archived"
                      ? t("credit.archivedEmpty")
                      : t("credit.empty")}
                </h2>
                <p>{searching ? t("credit.searchEmptyHint") : t("credit.emptyHint")}</p>
                {searching ? (
                  <button
                    type="button"
                    className="tool-btn"
                    onClick={() => setSearch("")}
                  >
                    {t("credit.clearSearch")}
                  </button>
                ) : (
                  <button
                    type="button"
                    className="tool-btn tool-btn--primary"
                    onClick={() => setAddOpen(true)}
                  >
                    <PlusIcon size={16} />
                    {t("credit.addCustomer")}
                  </button>
                )}
              </div>
            ) : (
              <div className="customer-list">
                {visible.map((c) => (
                  <CustomerRow
                    key={c.id}
                    customer={c}
                    attendant={attendant}
                    busy={busy}
                    to={link(`${base}/${c.id}`)}
                    onRestore={() => restore(c.id)}
                    t={t}
                  />
                ))}
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

/**
 * The book in one card: what is owed, who it sits with, and what needs chasing.
 *
 * It replaces three equally-weighted statistics with one figure an owner acts
 * on, and spends the recovered space on the two facts the old strip could not
 * express — concentration and age.
 */
function CreditHero({ insights, t }) {
  const { total, customers, owing, settled, archivedTotal, topShare, topCount, overdue } =
    insights;
  const owingShare = customers > 0 ? Math.round((owing / customers) * 100) : 0;
  return (
    <section className="card credit-hero" aria-labelledby="credit-hero-label">
      <div className="credit-hero__top">
        <div className="credit-hero__figure">
          <span className="credit-hero__label" id="credit-hero-label">
            {t("credit.totalOutstanding")}
          </span>
          <span className={`credit-hero__value ${total > 0 ? "neg" : "pos"}`}>
            ₹ <NumberRoll value={total} format={(n) => money(n)} />
          </span>
          <span className="credit-hero__sub">
            {t("credit.acrossCustomers", { owing, customers })}
          </span>
        </div>
        {overdue > 0 && (
          <span className="credit-flag" role="status">
            {t("credit.overdueFlag", { count: overdue })}
          </span>
        )}
      </div>

      {/* Exposure split: the share of the money sitting with the largest
          accounts, drawn rather than stated, so it reads at a glance. */}
      {total > 0 && (
        <div className="credit-hero__split">
          <div
            className="credit-bar"
            role="img"
            aria-label={t("credit.concentration", { count: topCount, percent: topShare })}
          >
            <span className="credit-bar__top" style={{ width: `${topShare}%` }} />
          </div>
          <p className="credit-hero__note small muted">
            {t("credit.concentration", { count: topCount, percent: topShare })}
          </p>
        </div>
      )}

      <div className="credit-hero__meta">
        <span className="credit-pill">
          {t("credit.customers")} <b>{customers}</b>
        </span>
        <span className="credit-pill credit-pill--neg">
          {t("credit.outstanding")} <b>{owing}</b>
          <small>{owingShare}%</small>
        </span>
        <span className="credit-pill credit-pill--pos">
          {t("credit.fullySettled")} <b>{settled}</b>
        </span>
        {archivedTotal > 0 && (
          <span className="credit-pill credit-pill--warn">
            {t("credit.archivedOutstanding")} <b>₹ {money(archivedTotal)}</b>
          </span>
        )}
      </div>
    </section>
  );
}

/** One account: who, how much, and how long it has been sitting there. */
function CustomerRow({ customer, attendant, busy, to, onRestore, t }) {
  const balance = Number(customer.outstandingBalance || 0);
  const { credit, payment } = lastMovement(customer);
  const age = accountAge(customer);
  const archived = Boolean(customer.archivedAt);
  const body = (
    <>
      <span
        className="customer-avatar"
        style={{ "--avatar-hue": avatarHue(customer.name) }}
        aria-hidden="true"
      >
        {customer.name?.trim()?.[0]?.toUpperCase() || "?"}
      </span>
      <span className="customer-main">
        <b>{customer.name}</b>
        <span className="customer-main__meta">
          {[
            customer.phone || t("credit.noPhone"),
            credit &&
              `${t("credit.lastCredit")} ₹${money(credit.amount)} · ${formatDayLabel(
                credit.date || credit.recordedAt
              )}`,
            payment &&
              `${t("credit.lastPayment")} ₹${money(payment.amount)} · ${formatDayLabel(
                payment.date || payment.recordedAt
              )}`,
          ]
            .filter(Boolean)
            .join("  ·  ")}
        </span>
        {!attendant && age.tone && (
          <span className={`credit-age credit-age--${age.tone}`}>
            {age.paid
              ? t("credit.agePaid", { days: age.days })
              : t("credit.ageUnpaid", { days: age.days })}
          </span>
        )}
      </span>
      {!attendant && (
        <span className={`customer-balance ${balance > 0 ? "neg" : "pos"}`}>
          {balance > 0 ? (
            <>
              <b>₹ {money(balance)}</b>
              <small>{t("credit.outstanding")}</small>
            </>
          ) : (
            <span className="credit-settled-pill">{t("credit.settled")}</span>
          )}
        </span>
      )}
      {!archived && !attendant && <ChevronIcon size={18} />}
    </>
  );

  if (archived)
    return (
      <div className="customer-row customer-row--archived">
        {body}
        <span className="customer-row__aside">
          <span className="tag">{t("credit.archived")}</span>
          <button type="button" className="small" onClick={onRestore} disabled={busy}>
            {t("credit.restore")}
          </button>
        </span>
      </div>
    );
  if (attendant) return <div className="customer-row">{body}</div>;
  return (
    <Link className="customer-row" to={to}>
      {body}
    </Link>
  );
}
