import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ScreenHeader } from "../../components/Layout.jsx";
import { Empty, Notice, Stat } from "../../components/ui.jsx";
import { LoadingPanels, NumberRoll, useAnimatedList } from "../../components/motion.jsx";
import { ChevronIcon, PlusIcon } from "../../components/icons.jsx";
import StationFilter from "../../components/StationFilter.jsx";
import ReportSheet from "../../components/ReportSheet.jsx";
import Sheet from "../../components/Sheet.jsx";
import { useAuth } from "../../state/AuthContext.jsx";
import { useStation } from "../../state/useStation.js";
import { useRunner } from "../../state/useRunner.js";
import { addTank, listTanks, readableError } from "../../lib/api";
import { formatStamp, money, num } from "../../lib/format";
import { stockByProduct, tankStatus, WATER_LIMIT_CM } from "../../lib/tankMath";
import { fuelClass } from "../../lib/fuel.js";
import { stockReport } from "../../lib/export.js";
import TankVessel from "./TankVessel.jsx";
import { AddTankForm } from "./forms.jsx";
import { useLanguage } from "../../state/LanguageContext.jsx";

/** Where this role's stock screens live. */
export function stockBase(role) {
  if (role === "owner") return "/owner/stock";
  if (role === "attendant") return "/today/stock";
  return "/station/stock";
}

/**
 * The tank farm as a list of tappable tank cards. Each card carries the one
 * bold figure that matters — litres in the ground — and taps through to the
 * tank's own screen for dips and deliveries. Warnings that need acting on
 * today sit above the list, not inside it.
 */
export default function StockList() {
  const { t, tn } = useLanguage();
  const { profile } = useAuth();
  const {
    stations,
    station,
    stationId,
    setStation,
    link,
    loading: stationsLoading,
  } = useStation();
  const base = stockBase(profile.role);
  const isOwner = profile.role === "owner";

  const [tanks, setTanks] = useState([]);
  const [dips, setDips] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [addOpen, setAddOpen] = useState(false);

  const load = useCallback(async () => {
    if (!stationId) return;
    setLoading(true);
    try {
      const { tanks: rows, dips: entries } = await listTanks(stationId);
      setTanks(rows);
      setDips(entries);
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

  const [run, busy] = useRunner(load);

  const active = useMemo(() => tanks.filter((tank) => tank.state !== "retired"), [tanks]);

  // Retiring a tank removes it from this list; hold it for one beat so the
  // card collapses instead of disappearing between renders.
  const tankRows = useAnimatedList(active);
  const byProduct = useMemo(() => stockByProduct(active), [active]);

  const totals = useMemo(() => {
    const states = active.map(tankStatus);
    return {
      stock: states.reduce((sum, x) => sum + x.stock, 0),
      capacity: states.reduce((sum, x) => sum + x.capacity, 0),
      ullage: states.reduce((sum, x) => sum + x.ullage, 0),
      low: states.filter((x) => x.level === "low" || x.level === "dry").length,
    };
  }, [active]);

  // Tanks needing water attention are worth surfacing without hunting.
  const wet = active.filter((tank) => num(tank.waterCm) > WATER_LIMIT_CM);

  const buildReport = useCallback(
    (range, filters = {}) =>
      stockReport({
        tanks: active,
        entries: dips,
        range,
        stationName: station?.name || "",
        ...filters,
      }),
    [active, dips, station]
  );

  if (stationsLoading) {
    return (
      <>
        <ScreenHeader title={t("stock.title")} />
        <div className="content">
          <LoadingPanels count={1} lines={2} label={t("common.loading")} />
        </div>
      </>
    );
  }

  return (
    <>
      <ScreenHeader
        title={t("stock.title")}
        sub={
          station
            ? `${station.name} · ${tn(tanks.length, "stock.tank", "stock.tanks")}`
            : ""
        }
        filter={
          <StationFilter stations={stations} value={stationId} onChange={setStation} />
        }
        actions={
          <>
            <ReportSheet
              report="stock"
              title="Ground stock"
              stationName={station?.name || ""}
              buildReport={buildReport}
            />
            {isOwner && (
              <button
                type="button"
                className="tool-btn tool-btn--primary"
                onClick={() => setAddOpen(true)}
              >
                <PlusIcon size={16} />
                {t("stock.addTank")}
              </button>
            )}
          </>
        }
      />
      <div className="content stack">
        {error && <Notice kind="error">{error}</Notice>}

        {loading ? (
          <LoadingPanels count={2} lines={3} label={t("common.loading")} />
        ) : tanks.length === 0 ? (
          <div className="empty-card">
            <h2>{t("stock.noTanks")}</h2>
            <p className="small muted">
              {isOwner ? t("stock.noTanksOwner") : t("stock.noTanksStaff")}
            </p>
          </div>
        ) : (
          <>
            {totals.low > 0 && (
              <Notice kind="error">
                {tn(totals.low, "stock.lowWarningOne", "stock.lowWarning")}
              </Notice>
            )}
            {wet.length > 0 && (
              <Notice kind="error">
                {t("stock.waterWarning", {
                  limit: WATER_LIMIT_CM,
                  tanks: wet.map((tank) => tank.name).join(", "),
                })}
              </Notice>
            )}

            <div className="tank-farm">
              {tankRows.map(({ item: tank, exiting }) => {
                const st = tankStatus(tank);
                return (
                  <Link
                    key={tank.id}
                    to={link(`${base}/${tank.id}`)}
                    className={`tank-card${exiting ? " row-exit" : " row-enter"}`}
                  >
                    <TankVessel tank={tank} />
                    <div className="tank-card__body">
                      <div className="tank-card__name">
                        <span
                          className={`fuel-dot fuel-dot--${fuelClass(tank.fuelType)}`}
                        />
                        {tank.name}
                      </div>
                      <div className="tank-card__fuel">{tank.fuelType}</div>
                      <div className="tank-card__figure">
                        <NumberRoll
                          value={tank.physicalStock ?? st.stock}
                          format={money}
                        />{" "}
                        <span>L</span>
                        <div className="tank-card__fuel">{t("stock.physicalStock")}</div>
                        <div className="tank-card__fuel">
                          {t("stock.bookStock")} {money(st.stock)} L ·{" "}
                          {t("stock.variance")}{" "}
                          {tank.stockVariance == null
                            ? "—"
                            : `${tank.stockVariance > 0 ? "+" : ""}${money(tank.stockVariance)} L`}
                        </div>
                        <div className="tank-card__fuel">
                          {t("stock.of")} {money(st.capacity)} L
                        </div>
                      </div>
                      <div className="tank-card__meta">
                        {tank.lastDipAt && (
                          <div>
                            {t("stock.dipped")} {formatStamp(tank.lastDipAt)}
                          </div>
                        )}
                      </div>
                    </div>
                    <span className="tank-card__chev">
                      <ChevronIcon size={16} />
                    </span>
                  </Link>
                );
              })}
            </div>

            <section className="card stat-strip">
              <Stat
                label={t("stock.stockInGround")}
                amount={totals.stock}
                format={(n) => `${money(n)} L`}
              />
              <Stat
                label={t("stock.spaceForDelivery")}
                amount={totals.ullage}
                format={(n) => `${money(n)} L`}
              />
              <Stat
                label={t("stock.totalCapacity")}
                amount={totals.capacity}
                format={(n) => `${money(n)} L`}
              />
            </section>

            {Object.keys(byProduct).length > 0 && (
              <section className="card card--flush">
                <div className="card__head">
                  <h2>{t("stock.byProduct")}</h2>
                </div>
                <table className="responsive-table">
                  <thead>
                    <tr>
                      <th>{t("stock.product")}</th>
                      <th className="num">{t("stock.tanksTitle")}</th>
                      <th className="num">{t("stock.inGround")}</th>
                      <th className="num">{t("stock.roomForDelivery")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(byProduct).map(([fuel, value]) => (
                      <tr key={fuel}>
                        <td data-label={t("stock.product")}>
                          <span className="row" style={{ gap: 6, alignItems: "center" }}>
                            <span className={`fuel-dot fuel-dot--${fuelClass(fuel)}`} />
                            {fuel}
                          </span>
                        </td>
                        <td data-label={t("stock.tanksTitle")} className="num mono">
                          {value.tanks}
                        </td>
                        <td data-label={t("stock.inGround")} className="num mono">
                          {money(value.stock)}
                        </td>
                        <td data-label={t("stock.roomForDelivery")} className="num mono">
                          {money(value.ullage)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>
            )}

            <section className="card card--flush">
              <div className="card__head">
                <h2>{t("stock.logTitle")}</h2>
                <span className="small muted">{t("stock.logNote")}</span>
              </div>
              {dips.length === 0 ? (
                <div className="card__pad">
                  <Empty>{t("stock.noReadings")}</Empty>
                </div>
              ) : (
                <table className="responsive-table">
                  <thead>
                    <tr>
                      <th>{t("stock.when")}</th>
                      <th>{t("stock.tankCol")}</th>
                      <th>{t("stock.entry")}</th>
                      <th className="num">{t("stock.change")}</th>
                      <th className="num">{t("stock.stockAfter")}</th>
                      <th>{t("stock.by")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dips.slice(0, 10).map((entry) => {
                      const tank = tanks.find((x) => x.id === entry.tankId);
                      const up = num(entry.change) > 0;
                      return (
                        <tr key={entry.id}>
                          <td data-label={t("stock.when")} className="mono small">
                            {formatStamp(entry.recordedAt)}
                          </td>
                          <td data-label={t("stock.tankCol")}>{tank?.name || "—"}</td>
                          <td data-label={t("stock.entry")}>
                            {entry.kind === "delivery" ? (
                              <span className="tag green">{t("stock.delivery")}</span>
                            ) : (
                              <span className="tag">{t("stock.dip")}</span>
                            )}
                          </td>
                          <td
                            data-label={t("stock.change")}
                            className="num mono"
                            style={{ color: up ? "var(--green)" : "var(--rust)" }}
                          >
                            {entry.change == null
                              ? "—"
                              : `${up ? "+" : ""}${money(entry.change)}`}
                          </td>
                          <td data-label={t("stock.stockAfter")} className="num mono">
                            {money(entry.stockLitres)}
                          </td>
                          <td data-label={t("stock.by")} className="small">
                            {entry.recordedByName || "—"}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </section>
          </>
        )}
      </div>

      <Sheet
        open={addOpen}
        onClose={() => setAddOpen(false)}
        title={t("stock.addTankTitle")}
        wide
      >
        <AddTankForm
          busy={busy}
          existing={tanks.length}
          onCancel={() => setAddOpen(false)}
          onSubmit={async (form) => {
            const ok = await run(() => addTank(stationId, form));
            if (ok) setAddOpen(false);
          }}
        />
      </Sheet>
    </>
  );
}
