import { useCallback, useEffect, useState } from "react";
import { listStations } from "../lib/api";
import { useAuth } from "./AuthContext";

/** Loads the stations the signed-in account may see. */
export function useStations() {
  const { profile } = useAuth();
  const [stations, setStations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const reload = useCallback(async () => {
    if (!profile) return;
    setLoading(true);
    try {
      const rows = await listStations(profile);
      rows.sort((a, b) => String(a.name).localeCompare(String(b.name)));
      setStations(rows);
      setError("");
    } catch (err) {
      setError(err?.message || "Could not load stations.");
    } finally {
      setLoading(false);
    }
  }, [profile]);

  useEffect(() => {
    reload();
  }, [reload]);

  return { stations, loading, error, reload, setStations };
}
