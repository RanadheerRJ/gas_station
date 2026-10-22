import { memo, useCallback, useMemo } from "react";
import { StationIcon } from "./icons.jsx";
import { useLanguage } from "../state/LanguageContext.jsx";

/**
 * The station picker as a compact filter pill that sits in a screen header.
 * One station (the common case for managers and attendants) renders nothing
 * at all — there is nothing to choose, so nothing takes the space.
 *
 * Performance:
 * - Memoized: header re-renders often (e.g. typing a search); this avoids
 *   re-rendering the select when stations/value haven't changed.
 * - onChange is a stable callback that guards against empty values.
 */
function StationFilter({ stations, value, onChange }) {
  const { t } = useLanguage();

  const handleChange = useCallback(
    (e) => {
      const next = e.target.value;
      if (!next) return;
      onChange?.(next);
    },
    [onChange]
  );

  const options = useMemo(
    () => (stations || []).map((s) => (
      <option key={s.id} value={s.id}>
        {s.name}
      </option>
    )),
    [stations]
  );

  if (!stations || stations.length <= 1) return null;

  return (
    <label className="station-filter">
      <StationIcon size={15} aria-hidden="true" />
      <select
        value={value || ""}
        onChange={handleChange}
        aria-label={t("common.station")}
      >
        {options}
      </select>
    </label>
  );
}

export default memo(StationFilter);
