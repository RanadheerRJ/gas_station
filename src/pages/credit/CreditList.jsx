import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { ScreenHeader } from "../../components/Layout.jsx";
import { Notice, Stat } from "../../components/ui.jsx";
import { LoadingPanels, NumberRoll, useAnimatedList } from "../../components/motion.jsx";
import { ChevronIcon, PlusIcon } from "../../components/icons.jsx";
import StationFilter from "../../components/StationFilter.jsx";
import ReportSheet from "../../components/ReportSheet.jsx";
import Sheet from "../../components/Sheet.jsx";
import { useAuth } from "../../state/AuthContext.jsx";
import { useStation } from "../../state/useStation.js";
import { useRunner } from "../../state/useRunner.js";
import { createCustomer, listCustomers, readableError } from "../../lib/api";
import { money } from "../../lib/format";
import { creditReport } from "../../lib/export.js";
import { useLanguage } from "../../state/LanguageContext.jsx";

/** Where this role's credit screens live. */
export function creditBase(role) {
  return role === "owner" ? "/owner/credit" : "/station/credit";
}

/**
 * The customer list: one card per account with the figure that decides the
 * conversation — the outstanding balance — and a tap through to the
 * account's full statement. Adding a customer is a sheet, not a fixture.
 */
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

  const [customers, setCustomers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [addOpen, setAddOpen] = useState(false);
  const [newCustomer, setNewCustomer] = useState({ name: "", phone: "" });

  const load = useCallback(async () => {
    if (!stationId) return;
    setLoading(true);
    try {
      const rows = await listCustomers(stationId);
      rows.sort(
        (a, b) => Number(b.outstandingBalance || 0) - Number(a.outstandingBalance || 0)
      );
      setCustomers(rows);
      setError("");
    } catch (err) {
      setError(readableError(err));
    } finally {
      setLoading(false);
    }
  }, [stationId]);

  useEffect(() => {
    load();
  }, [load]);

  const [run, busy, runError] = useRunner(load);

  const totalOutstanding = customers.reduce(
    (sum, customer) => sum + Number(customer.outstandingBalance || 0),
    0
  );
  const settled = customers.filter(
    (customer) => Number(customer.outstandingBalance || 0) <= 0
  ).length;

  // Keeps a removed customer mounted long enough to collapse out of the list.
  const customerRows = useAnimatedList(customers);

  const buildReport = useCallback(
    (range) => creditReport({ customers, range, stationName: station?.name || "" }),
    [customers, station]
  );

  const addCustomer = async (e) => {
    e.preventDefault();
    const ok = await run(() =>
      createCustomer(stationId, {
        name: newCustomer.name.trim(),
        phone: newCustomer.phone.trim(),
      })
    );
    if (ok) {
      setNewCustomer({ name: "", phone: "" });
      setAddOpen(false);
    }
  };

  if (stationsLoading) {
    return (
      <>
        <ScreenHeader title={t("credit.title")} />
        <div className="content">
          <LoadingPanels count={1} lines={2} label={t("common.loading")} />
        </div>
      </>
    );
  }

  return (
    <>
      <ScreenHeader
        title={t("credit.title")}
        sub={station?.name}
        filter={
          <StationFilter stations={stations} value={stationId} onChange={setStation} />
        }
        actions={
          <>
            <ReportSheet
              report="credit"
              title="Credit customers"
              stationName={station?.name || ""}
              buildReport={buildReport}
            />
            <button
              type="button"
              className="tool-btn tool-btn--primary"
              onClick={() => setAddOpen(true)}
            >
              <PlusIcon size={16} />
              {t("credit.addCustomer")}
            </button>
          </>
        }
      />
      <div className="content stack">
        {error && <Notice kind="error">{error}</Notice>}
        {runError && <Notice kind="error">{runError}</Notice>}

        {loading ? (
          <LoadingPanels count={3} lines={2} label={t("common.loading")} />
        ) : customers.length === 0 ? (
          <div className="empty-card">
            <h2>{t("credit.empty")}</h2>
          </div>
        ) : (
          <>
            <section className="card stat-strip">
              <Stat
                label={t("credit.totalOutstanding")}
                amount={totalOutstanding}
                format={money}
                prefix="₹ "
                tone={totalOutstanding > 0 ? "neg" : "pos"}
              />
              <Stat
                label={t("credit.customers")}
                amount={customers.length}
                format={(n) => String(Math.round(n))}
              />
              <Stat
                label={t("credit.fullySettled")}
                amount={settled}
                format={(n) => String(Math.round(n))}
                tone="pos"
              />
            </section>

            <div className="list-stack">
              {customerRows.map(({ item: customer, exiting }) => {
                const balance = Number(customer.outstandingBalance || 0);
                return (
                  <Link
                    key={customer.id}
                    to={link(`${base}/${customer.id}`)}
                    className={`list-card${exiting ? " row-exit" : " row-enter"}`}
                  >
                    <div className="list-card__row">
                      <span className="list-card__title">
                        {customer.name}
                        <span className="list-card__date mono small">
                          {customer.phone || "—"}
                        </span>
                      </span>
                      {balance > 0 ? (
                        <span className="tag rust">{t("credit.outstanding")}</span>
                      ) : (
                        <span className="tag green">{t("credit.settled")}</span>
                      )}
                    </div>
                    <div className="list-card__row list-card__row--figures">
                      <span className="list-card__figure">
                        <span className="k">{t("credit.balance")}</span>
                        <span className={`v mono ${balance > 0 ? "neg" : "pos"}`}>
                          ₹ <NumberRoll value={balance} format={money} />
                        </span>
                      </span>
                      <span className="list-card__chev">
                        <ChevronIcon size={17} />
                      </span>
                    </div>
                  </Link>
                );
              })}
            </div>
          </>
        )}
      </div>

      <Sheet
        open={addOpen}
        onClose={() => setAddOpen(false)}
        title={t("credit.newCustomer")}
      >
        <form className="stack" style={{ gap: 14 }} onSubmit={addCustomer}>
          <label className="field">
            <span>{t("credit.customerName")}</span>
            <input
              value={newCustomer.name}
              onChange={(e) => setNewCustomer((c) => ({ ...c, name: e.target.value }))}
              placeholder="Sri Balaji Transports"
            />
          </label>
          <label className="field">
            <span>{t("common.phone")}</span>
            <input
              className="mono"
              inputMode="tel"
              value={newCustomer.phone}
              onChange={(e) => setNewCustomer((c) => ({ ...c, phone: e.target.value }))}
              placeholder="+91 90101 22334"
            />
          </label>
          <button
            className="cta"
            type="submit"
            disabled={busy || !newCustomer.name.trim()}
          >
            {busy ? t("common.saving") : t("credit.addCustomer")}
          </button>
        </form>
      </Sheet>
    </>
  );
}
