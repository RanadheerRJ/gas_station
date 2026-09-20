import { useCallback, useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { ScreenHeader } from "../../components/Layout.jsx";
import { ActionBar, Notice, Segmented, Stat } from "../../components/ui.jsx";
import { LoadingPanels } from "../../components/motion.jsx";
import { useAuth } from "../../state/AuthContext.jsx";
import { useStation } from "../../state/useStation.js";
import { useRunner } from "../../state/useRunner.js";
import {
  listTanks,
  readableError,
  recordDelivery,
  recordDip,
  setTankState,
} from "../../lib/api";
import { formatStamp, money, num } from "../../lib/format";
import { REFERENCE_TEMP_C, tankStatus } from "../../lib/tankMath";
import TankVessel from "./TankVessel.jsx";
import { DipForm, DeliveryForm } from "./forms.jsx";
import { stockBase } from "./StockList.jsx";
import { useLanguage } from "../../state/LanguageContext.jsx";

/**
 * One tank, one screen: what is in the ground right now, and the two ways
 * that number changes — a dip or a delivery. The active form's submit is the
 * pinned action, so recording a reading is a single thumb movement from
 * arriving on the screen.
 */
export default function TankDetail() {
  const { t } = useLanguage();
  const { tankId } = useParams();
  const { profile } = useAuth();
  const { station, stationId, link, loading: stationsLoading } = useStation();
  const base = stockBase(profile.role);
  const isOwner = profile.role === "owner";

  const [tanks, setTanks] = useState([]);
  const [dips, setDips] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [mode, setMode] = useState("dip");

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

  const [run, busy, runError] = useRunner(load);

  const tank = tanks.find((x) => x.id === tankId);
  const entries = useMemo(
    () => dips.filter((entry) => entry.tankId === tankId),
    [dips, tankId]
  );

  if (stationsLoading || loading) {
    return (
      <>
        <ScreenHeader title={t("stock.title")} back={link(base)} />
        <div className="content">
          <LoadingPanels count={2} lines={3} label={t("common.loading")} />
        </div>
      </>
    );
  }

  if (!tank) {
    return (
      <>
        <ScreenHeader title={t("stock.title")} back={link(base)} />
        <div className="content">
          <div className="empty-card">
            <h2>{t("stock.tankNotFound")}</h2>
          </div>
        </div>
      </>
    );
  }

  const st = tankStatus(tank);

  return (
    <>
      <ScreenHeader
        title={tank.name}
        sub={`${tank.fuelType} · ${money(tank.capacity)} L${
          station ? ` · ${station.name}` : ""
        }`}
        back={link(base)}
      />
      <div className="content stack">
        {error && <Notice kind="error">{error}</Notice>}
        {runError && <Notice kind="error">{runError}</Notice>}

        {/* ---- what is in the ground ---- */}
        <section className="card tank-hero">
          <TankVessel tank={tank} size="lg" />
          <div className="tank-hero__figures">
            <div className="tank-hero__stock">
              <span className="v mono">{money(st.stock)}</span>
              <span className="k">L {t("stock.stockInGround")}</span>
            </div>
            <div className="row" style={{ gap: 28, flexWrap: "wrap" }}>
              <Stat label={t("stock.totalCapacity")} value={`${money(st.capacity)} L`} />
              <Stat label={t("stock.spaceForDelivery")} value={`${money(st.ullage)} L`} />
              <Stat
                label={t("stock.volumeAt", { temp: REFERENCE_TEMP_C })}
                value={st.volumeAt15 == null ? "—" : `${money(st.volumeAt15)} L`}
              />
            </div>
            <div className="small muted tank-hero__meta">
              {tank.temperatureC == null ? (
                <span>{t("stock.noTemperature")}</span>
              ) : (
                <span
                  className={`temp-chip${num(tank.temperatureC) > 35 ? " warm" : ""}`}
                >
                  {num(tank.temperatureC).toFixed(1)} °C
                </span>
              )}
              {tank.lastDipAt && (
                <span>
                  {t("stock.dipped")} {formatStamp(tank.lastDipAt)}
                </span>
              )}
            </div>
          </div>
        </section>

        {/* ---- dip or delivery ---- */}
        <section className="card">
          <div className="card__head">
            <h2>{t("stock.logTitle")}</h2>
            <Segmented
              value={mode}
              onChange={setMode}
              options={[
                { value: "dip", label: t("stock.recordDip") },
                { value: "delivery", label: t("stock.bookDelivery") },
              ]}
            />
          </div>
          {mode === "dip" ? (
            <DipForm
              tank={tank}
              busy={busy}
              onSubmit={(reading) => run(() => recordDip(stationId, tank.id, reading))}
            />
          ) : (
            <DeliveryForm
              tank={tank}
              busy={busy}
              onSubmit={(delivery) =>
                run(() => recordDelivery(stationId, tank.id, delivery))
              }
            />
          )}
        </section>

        {/* ---- this tank's readings ---- */}
        {entries.length > 0 && (
          <section className="card card--flush">
            <div className="card__head">
              <h2>{t("stock.logTitle")}</h2>
            </div>
            <table>
              <thead>
                <tr>
                  <th>{t("stock.when")}</th>
                  <th>{t("stock.entry")}</th>
                  <th className="num">{t("stock.change")}</th>
                  <th className="num">{t("stock.stockAfter")}</th>
                  <th className="num">{t("stock.temp")}</th>
                  <th className="num">{t("stock.water")}</th>
                  <th>{t("stock.by")}</th>
                </tr>
              </thead>
              <tbody>
                {entries.slice(0, 20).map((entry) => {
                  const up = num(entry.change) > 0;
                  return (
                    <tr key={entry.id}>
                      <td className="mono small">{formatStamp(entry.recordedAt)}</td>
                      <td>
                        {entry.kind === "delivery" ? (
                          <span className="tag green">{t("stock.delivery")}</span>
                        ) : (
                          <span className="tag">{t("stock.dip")}</span>
                        )}
                        {entry.note && <div className="small muted">{entry.note}</div>}
                      </td>
                      <td
                        className="num mono"
                        style={{ color: up ? "var(--green)" : "var(--rust)" }}
                      >
                        {entry.change == null
                          ? "—"
                          : `${up ? "+" : ""}${money(entry.change)}`}
                      </td>
                      <td className="num mono">{money(entry.stockLitres)}</td>
                      <td className="num mono">
                        {entry.temperatureC == null
                          ? "—"
                          : `${num(entry.temperatureC).toFixed(1)}°`}
                      </td>
                      <td className="num mono">
                        {entry.waterCm == null ? "—" : `${num(entry.waterCm).toFixed(1)}`}
                      </td>
                      <td className="small">{entry.recordedByName || "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </section>
        )}

        {/* ---- owner: service state ---- */}
        {isOwner && (
          <div className="between card card--pad">
            <span className="small muted">
              {tank.state === "retired"
                ? t("stock.tankRetired")
                : t("stock.tankActiveNote")}
            </span>
            <button
              type="button"
              className="quiet"
              disabled={busy}
              onClick={() =>
                run(() =>
                  setTankState(
                    stationId,
                    tank.id,
                    tank.state === "retired" ? "active" : "retired"
                  )
                )
              }
            >
              {tank.state === "retired"
                ? t("stock.returnToService")
                : t("stock.takeOutOfService")}
            </button>
          </div>
        )}

        {/* The active form's submit, pinned. The button belongs to the form
            via its id, so validation and the busy state behave exactly as
            they would inside the card. */}
        <ActionBar>
          <button
            type="submit"
            className="cta"
            disabled={busy}
            form={mode === "dip" ? "tank-dip-form" : "tank-delivery-form"}
          >
            {mode === "dip" ? t("stock.saveDip") : t("stock.bookDelivery")}
          </button>
        </ActionBar>
      </div>
    </>
  );
}
