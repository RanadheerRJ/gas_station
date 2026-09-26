import { Panel } from "../../components/ui";
import { GaugeIcon } from "../../components/icons";
import { useLanguage } from "../../state/LanguageContext.jsx";

/**
 * The house rules for meters and prices, written where the person setting
 * them up will read them — once, before the first shift, rather than after
 * the first argument about a figure.
 */
export default function ReadingsFlowPanel() {
  const { t } = useLanguage();
  return (
    <Panel
      title={
        <span className="row" style={{ gap: 7, alignItems: "center" }}>
          <GaugeIcon /> {t("setup.howReadingsFlow")}
        </span>
      }
    >
      <ul
        className="small muted"
        style={{ margin: 0, paddingLeft: 18, lineHeight: 1.75 }}
      >
        <li>
          Set each nozzle’s meter reading once, here. After that the figure advances
          automatically — every shift’s closing reading becomes the next one’s opening.
        </li>
        <li>
          Nobody types litres or sale amounts. Staff pick the nozzles they are taking, and
          enter only the closing reading at handover — sales are{" "}
          <span className="mono">(closing − opening) × price</span>.
        </li>
        <li>
          Change a price whenever it moves. A running shift keeps the price it started
          with, and the old price stays in history.
        </li>
      </ul>
    </Panel>
  );
}
