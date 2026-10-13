import { useState } from "react";
import { useTheme } from "../state/ThemeContext.jsx";
import { useLanguage } from "../state/LanguageContext.jsx";
import { money, num } from "../lib/format.js";
import { Card } from "../components/Card.jsx";
import { Chip, ChipRow } from "../components/Chip.jsx";
import StickyCta from "../components/StickyCta.jsx";
import ListRow from "../components/ListRow.jsx";
import Skeleton from "../components/Skeleton.jsx";
import EmptyState from "../components/EmptyState.jsx";
import { Notice, Panel, Segmented, Stat } from "../components/ui.jsx";
import Sheet from "../components/Sheet.jsx";
import StepProgress from "../components/StepProgress.jsx";
import Money from "../components/Money.jsx";
import VariancePill from "../components/VariancePill.jsx";
import {
  ChartIcon,
  ChevronIcon,
  DownloadIcon,
  HistoryIcon,
  NozzleIcon,
  TankIcon,
} from "../components/icons.jsx";

/**
 * The component kit: every foundation component on one screen, in the active
 * theme, so a change to tokens.css or the shared styles can be eyeballed
 * before it reaches a real screen.
 *
 * Dev-only. The route is registered in App.jsx behind import.meta.env.DEV,
 * so the page (and its lazy chunk) never exist in a production build. Every
 * label goes through the translation system like any real screen.
 */
export default function Kit() {
  const { t } = useLanguage();
  const { theme, toggleTheme } = useTheme();
  const [tab, setTab] = useState("all");
  const [view, setView] = useState("overview");
  const [sheetOpen, setSheetOpen] = useState(false);
  const [picked, setPicked] = useState(2);

  const tabs = [
    { id: "all", label: t("shifts.tabAll"), count: 12 },
    { id: "live", label: t("shifts.tabLive"), count: 1 },
    { id: "review", label: t("shifts.tabReview"), count: 3 },
    { id: "closed", label: t("shifts.tabClosed"), count: 8 },
  ];

  return (
    <div className="kit">
      <div className="screen-head">
        <div className="screen-head__row">
          <div className="screen-head__titles">
            <h1>{t("kit.title")}</h1>
            <div className="sub">{t("kit.devOnly")}</div>
          </div>
          <div className="screen-head__actions">
            <Segmented
              value={theme}
              onChange={(next) => {
                if (next !== theme) toggleTheme();
              }}
              options={[
                { value: "light", label: t("chrome.lightMode") },
                { value: "dark", label: t("chrome.darkMode") },
              ]}
            />
          </div>
        </div>
      </div>

      <div className="content">
        <div className="stack">
          <section className="kit__section">
            <div className="section-label">
              <h2>{t("kit.buttons")}</h2>
            </div>
            <div className="kit__row">
              <button type="button" className="primary">
                {t("common.save")}
              </button>
              <button type="button">{t("common.cancel")}</button>
              <button type="button" className="small">
                {t("common.add")}
              </button>
              <button type="button" className="quiet">
                {t("common.moreActions")}
              </button>
              <button type="button" className="danger">
                {t("admin.deleteLogin")}
              </button>
              <button type="button" className="tool-btn">
                <DownloadIcon size={16} />
                {t("report.exportCsv")}
              </button>
              <button type="button" className="tool-btn tool-btn--primary">
                <NozzleIcon size={16} />
                {t("shifts.startShift")}
              </button>
              <button type="button" className="cta">
                {t("shifts.startShift")}
              </button>
              <button type="button" className="cta" disabled>
                {t("common.saving")}
              </button>
              <button type="button" className="cta">
                <span className="spinner" aria-hidden="true" />
                {t("common.saving")}
              </button>
            </div>
          </section>

          <section className="kit__section">
            <div className="section-label">
              <h2>{t("kit.chips")}</h2>
            </div>
            <ChipRow label={t("common.status")}>
              {tabs.map((item) => (
                <Chip
                  key={item.id}
                  label={item.label}
                  count={item.count}
                  selected={tab === item.id}
                  onClick={() => setTab(item.id)}
                />
              ))}
            </ChipRow>
            <div className="kit__row">
              <Chip label={t("today.stationOnline")} tone="accent" icon={ChartIcon} />
              <Chip label={t("today.shiftRunning")} tone="ok" />
              <Chip label={t("owner.toReview", { count: 2 })} tone="credit" />
              <Chip
                label={t("close.varianceShort", { amount: money(120) })}
                tone="short"
              />
              <Chip label={t("shifts.tabClosed")} selected />
            </div>
          </section>

          <section className="kit__section">
            <div className="section-label">
              <h2>{t("kit.cards")}</h2>
            </div>
            <div className="kit__grid">
              <Card>
                <div className="stat">
                  <span className="k">{t("today.sales")}</span>
                  <span className="v">
                    <span className="figure-hero">{money(12480)}</span>
                  </span>
                </div>
                <div className="stat">
                  <span className="k">{t("today.fuelDispensed")}</span>
                  <span className="v">
                    <span className="figure-hero">
                      {num(342)}
                      <span className="figure-hero__unit">{t("common.litres")}</span>
                    </span>
                  </span>
                </div>
              </Card>
              <Card to="/__kit">
                <div className="between">
                  <div className="stat">
                    <span className="k">{t("kit.pressable")}</span>
                    <span className="v">{t("kit.pressableHint")}</span>
                  </div>
                  <ChevronHint />
                </div>
              </Card>
              <Card onClick={() => setSheetOpen(true)} flush={false}>
                <div className="between">
                  <div className="stat">
                    <span className="k">{t("kit.sheets")}</span>
                    <span className="v">{t("kit.openSheet")}</span>
                  </div>
                  <ChevronHint />
                </div>
              </Card>
            </div>
          </section>

          <section className="kit__section">
            <div className="section-label">
              <h2>{t("kit.rows")}</h2>
            </div>
            <div className="kit__grid">
              <ListRow
                icon={HistoryIcon}
                title={t("nav.history")}
                subtitle={t("today.closedShifts", { count: 4 })}
                trailing={<Money kind="in" value={2960} label={t("today.sales")} />}
                to="/__kit"
              />
              <ListRow
                avatar={t("role.attendant")}
                title={t("nav.account")}
                subtitle={t("today.shiftRunning")}
                trailing={<Chip label={t("shifts.tabLive")} tone="ok" />}
                onClick={() => setSheetOpen(true)}
              />
              <ListRow
                icon={TankIcon}
                title={t("nav.groundStock")}
                trailing={<span className="muted small">{t("common.none")}</span>}
                chevron={false}
              />
            </div>
          </section>

          <section className="kit__section">
            <div className="section-label">
              <h2>{t("kit.skeletons")}</h2>
            </div>
            <div className="kit__grid">
              <Skeleton shape="card" />
              <Skeleton shape="row" count={2} />
            </div>
          </section>

          <section className="kit__section">
            <div className="section-label">
              <h2>{t("kit.empty")}</h2>
            </div>
            <Card>
              <EmptyState
                icon={NozzleIcon}
                headline={t("kit.emptyTitle")}
                body={t("kit.emptyBody")}
                actionLabel={t("shifts.startShift")}
                onAction={() => setPicked((n) => n + 1)}
              />
            </Card>
          </section>

          <section className="kit__section">
            <div className="section-label">
              <h2>{t("kit.segmented")}</h2>
            </div>
            <div className="kit__row">
              <Segmented
                value={view}
                onChange={setView}
                options={[
                  { value: "overview", label: t("nav.overview") },
                  { value: "history", label: t("nav.history") },
                  { value: "account", label: t("nav.account") },
                ]}
              />
            </div>
          </section>

          <section className="kit__section">
            <div className="section-label">
              <h2>{t("kit.panels")}</h2>
            </div>
            <Panel title={t("common.station")} note={t("today.stationOnline")}>
              <div className="stat-strip">
                <Stat label={t("today.sales")} amount={12480} format={money} />
                <Stat
                  label={t("today.fuelDispensed")}
                  amount={342}
                  format={(n) => num(n)}
                />
                <Stat label={t("common.total")} value={money(4120)} />
                <Stat
                  label={t("close.varianceShort", { amount: money(120) })}
                  value={money(-120)}
                  tone="neg"
                />
              </div>
            </Panel>
          </section>

          <section className="kit__section">
            <div className="section-label">
              <h2>{t("kit.money")}</h2>
            </div>
            <Card>
              <div className="kit__row">
                <Money kind="in" value={1250} label={t("common.total")} />
                <Money kind="out" value={340} label={t("common.total")} />
                <Money kind="credit" value={90} label={t("common.total")} />
                <Money kind="variance" value={-120} label={t("common.total")} />
                <VariancePill variance={0} />
                <VariancePill variance={-120} />
                <VariancePill variance={80} />
                <VariancePill variance={null} />
              </div>
            </Card>
          </section>

          <section className="kit__section">
            <div className="section-label">
              <h2>{t("kit.notices")}</h2>
            </div>
            <div className="kit__grid">
              <Notice>{t("chrome.offline")}</Notice>
              <Notice kind="error">{t("common.phoneProblem")}</Notice>
              <Notice kind="good">{t("close.varianceMatches")}</Notice>
              <Notice kind="attention">{t("owner.toReview", { count: 2 })}</Notice>
            </div>
          </section>

          <section className="kit__section">
            <div className="section-label">
              <h2>{t("kit.sheets")}</h2>
            </div>
            <div className="kit__row">
              <button
                type="button"
                className="primary"
                onClick={() => setSheetOpen(true)}
              >
                {t("kit.openSheet")}
              </button>
            </div>
          </section>

          <section className="kit__section">
            <div className="section-label">
              <h2>{t("kit.steps")}</h2>
            </div>
            <Card>
              <StepProgress
                steps={[
                  { id: "readings", label: t("shifts.closingReadings"), done: true },
                  { id: "testing", label: t("shifts.fuelTested"), done: false },
                  { id: "credit", label: t("shifts.creditSales"), done: false },
                ]}
              />
            </Card>
          </section>
        </div>
      </div>

      <StickyCta
        summary={t("kit.stickySummary", { count: picked })}
        hint={t("kit.stickyHint")}
        ctaLabel={t("shifts.startShift")}
        onCta={() => setPicked((n) => n + 1)}
        secondary={
          <button type="button" onClick={() => setPicked(0)}>
            {t("common.cancel")}
          </button>
        }
      />

      <Sheet open={sheetOpen} onClose={() => setSheetOpen(false)} title={t("kit.sheets")}>
        <div className="stack">
          <p className="small muted">{t("kit.sheetBody")}</p>
          <button type="button" className="primary" onClick={() => setSheetOpen(false)}>
            {t("common.close")}
          </button>
        </div>
      </Sheet>
    </div>
  );
}

/** The chevron a pressable card carries, drawn inline so the kit stays flat. */
function ChevronHint() {
  return (
    <span className="list-row__chevron" aria-hidden="true">
      <ChevronIcon size={18} />
    </span>
  );
}
