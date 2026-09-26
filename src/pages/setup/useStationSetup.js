import { useCallback, useEffect, useState } from "react";
import { useAuth } from "../../state/AuthContext";
import { useStation } from "../../state/useStation";
import {
  addNozzle,
  addPump,
  getPrices,
  listPumps,
  listTanks,
  mapNozzleTank,
  readableError,
  setNozzleState,
  setPumpState,
  setPrice as apiSetPrice,
} from "../../lib/api";
import { activePrices } from "../../lib/shiftMath";
import { num } from "../../lib/format";

/** The fuels a new nozzle can dispense. */
export const FUEL_TYPES = ["Petrol", "Diesel", "Premium Petrol", "CNG"];

/**
 * The station's equipment and prices, and every write that changes them.
 *
 * Pumps, nozzles, tank mappings and effective-dated prices all come from one
 * load and all go back through one `run`, which reloads afterwards so the
 * screen can never drift from the database. The screen itself only draws
 * what this returns.
 */
export function useStationSetup() {
  const { profile } = useAuth();
  const {
    stations,
    station,
    stationId,
    setStation,
    loading: stationsLoading,
  } = useStation();

  const [pumps, setPumps] = useState([]);
  const [nozzles, setNozzles] = useState([]);
  const [tanks, setTanks] = useState([]);
  const [priceRecords, setPriceRecords] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const [pumpName, setPumpName] = useState("");
  const [nozzleFor, setNozzleFor] = useState(null);
  const [nozzleForm, setNozzleForm] = useState({
    name: "",
    fuelType: "Petrol",
    openingReading: "",
  });
  const [rateDraft, setRateDraft] = useState({});
  const [resetting, setResetting] = useState(null);

  const load = useCallback(async () => {
    if (!stationId) return;
    setLoading(true);
    try {
      const [eq, pr, stock] = await Promise.all([
        listPumps(stationId),
        getPrices(stationId),
        listTanks(stationId),
      ]);
      setPumps(eq.pumps);
      setNozzles(eq.nozzles);
      setTanks(stock.tanks.filter((tank) => tank.state !== "retired"));
      setPriceRecords(pr);
      setRateDraft({});
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

  const run = async (fn) => {
    setBusy(true);
    setError("");
    try {
      await fn();
      await load();
    } catch (err) {
      setError(readableError(err));
    } finally {
      setBusy(false);
    }
  };

  // Only fuels actually dispensed here need a price.
  const activeFuels = [...new Set(nozzles.map((n) => n.fuelType))];
  const active = activePrices(priceRecords);

  /** A new price for a fuel, effective now; the old one closes behind it. */
  const updatePrice = (fuel, draft) =>
    run(async () => {
      await apiSetPrice(stationId, { fuelType: fuel, price: num(draft) }, profile);
    });

  const submitPump = () =>
    run(async () => {
      await addPump(stationId, { name: pumpName.trim() });
      setPumpName("");
    });

  /** Open (or close) the add-nozzle form under a pump, always blank. */
  const toggleNozzleForm = (pumpId) => {
    setNozzleFor(nozzleFor === pumpId ? null : pumpId);
    setNozzleForm({ name: "", fuelType: "Petrol", openingReading: "" });
  };

  const submitNozzle = (pumpId) =>
    run(async () => {
      await addNozzle(stationId, {
        pumpId,
        name: nozzleForm.name.trim(),
        fuelType: nozzleForm.fuelType,
        openingReading: num(nozzleForm.openingReading),
      });
      setNozzleFor(null);
    });

  const togglePumpState = (pump) =>
    run(() =>
      setPumpState(stationId, pump.id, pump.state === "retired" ? "active" : "retired")
    );

  const toggleNozzleState = (nozzle) =>
    run(() =>
      setNozzleState(
        stationId,
        nozzle.id,
        nozzle.state === "retired" ? "active" : "retired"
      )
    );

  const assignTank = (nozzleId, tankId) =>
    run(() => mapNozzleTank(stationId, nozzleId, tankId));

  return {
    stations,
    station,
    stationId,
    setStation,
    stationsLoading,
    pumps,
    nozzles,
    tanks,
    priceRecords,
    loading,
    error,
    busy,
    pumpName,
    setPumpName,
    nozzleFor,
    nozzleForm,
    setNozzleForm,
    rateDraft,
    setRateDraft,
    resetting,
    setResetting,
    activeFuels,
    active,
    load,
    updatePrice,
    submitPump,
    toggleNozzleForm,
    submitNozzle,
    togglePumpState,
    toggleNozzleState,
    assignTank,
  };
}
