import { useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import { useStations } from "./useStations";

/**
 * The station a screen is looking at, as a top-level filter rather than a
 * panel competing for scroll space.
 *
 * The choice lives in the `?station=` query parameter, so it survives
 * navigation between the shift, ledger, stock and credit screens — moving
 * from a station's ledger to its stock keeps you on the same station — and
 * deep links (an owner's overview cards link straight into a station's
 * ledger) carry it with them.
 *
 * `link(to)` builds a router target that preserves the choice, so detail
 * screens inherit the station their list was showing.
 */
export function useStation() {
  const { stations, loading, reload } = useStations();
  const [params, setParams] = useSearchParams();

  const wanted = params.get("station");
  const valid = stations.some((s) => s.id === wanted);
  // An absent or foreign station id falls back to the first station the
  // account may see. RLS still decides what is readable; this only picks
  // which station's screens to draw.
  const stationId = stations.length ? (valid ? wanted : stations[0].id) : "";
  const station = stations.find((s) => s.id === stationId);

  const setStation = useCallback(
    (id) => {
      setParams({ station: id }, { replace: true });
    },
    [setParams]
  );

  /** A Link target for `to` that keeps the current station in the URL. */
  const link = useCallback(
    (to) => ({
      pathname: to,
      search: stationId ? `?station=${encodeURIComponent(stationId)}` : "",
    }),
    [stationId]
  );

  return { stations, station, stationId, setStation, link, loading, reload };
}
