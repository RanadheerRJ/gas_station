import { StationIcon } from "./icons.jsx";
import { useLanguage } from "../state/LanguageContext.jsx";

/**
 * The station picker as a compact filter pill that sits in a screen header.
 * One station (the common case for managers and attendants) renders nothing
 * at all — there is nothing to choose, so nothing takes the space.
 */
export default function StationFilter({ stations, value, onChange }) {
  const { t } = useLanguage();
  if (!stations || stations.length <= 1) return null;
  return (
    <label className="station-filter">
      <StationIcon size={15} />
      <select
        value={value || ""}
        onChange={(e) => onChange(e.target.value)}
        aria-label={t("common.station")}
      >
        {stations.map((s) => (
          <option key={s.id} value={s.id}>
            {s.name}
          </option>
        ))}
      </select>
    </label>
  );
}
