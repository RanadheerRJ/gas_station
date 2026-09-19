/**
 * Single Supabase data-access facade for the UI.
 *
 * Reads are protected by Postgres row-level security. Every state transition
 * that changes balances, stock, equipment, or shifts is an SQL RPC so it is
 * atomic even when two operators act at the same time.
 */

import { staffLoginEmail, staffPinPassword } from "./credentials";
import { pinProblem } from "./pin.js";
import { supabase, supabaseConfigured } from "./supabase";

function assertConfigured() {
  if (!supabaseConfigured || !supabase) {
    throw new Error(
      "Supabase is not configured. Copy .env.example to .env.local and fill in " +
        "VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY."
    );
  }
  return supabase;
}

/** Convert PostgreSQL snake_case responses to the UI's established camelCase contract. */
function camelize(value) {
  if (Array.isArray(value)) return value.map(camelize);
  if (!value || typeof value !== "object" || value instanceof Date) return value;
  return Object.fromEntries(
    Object.entries(value).map(([key, child]) => [
      key.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase()),
      camelize(child),
    ])
  );
}

function result({ data, error }) {
  if (error) throw error;
  return data;
}

async function rpc(name, args) {
  return result(await assertConfigured().rpc(name, args));
}

async function query(request) {
  return result(await request);
}

function mapProfile(row) {
  if (!row) return null;
  const profile = camelize(row);
  return {
    ...profile,
    uid: row.id,
    stationIds: row.station_id ? [row.station_id] : [],
  };
}

function mapShift(row) {
  const {
    shift_nozzles: rawNozzles = [],
    shift_expenses: rawExpenses = [],
    ...shift
  } = row;
  return {
    ...camelize(shift),
    id: row.id,
    stationId: row.station_id,
    userId: row.employee_id,
    date: row.shift_date,
    nozzles: rawNozzles
      .map(camelize)
      .sort((a, b) => String(a.label).localeCompare(String(b.label))),
    expenses: rawExpenses
      .map((expense) => ({ ...camelize(expense), at: expense.occurred_at }))
      .sort((a, b) => String(a.at).localeCompare(String(b.at))),
  };
}

function mapCustomer(row) {
  const { customer_transactions: rawTransactions = [], ...customer } = row;
  return {
    ...camelize(customer),
    transactions: rawTransactions
      .map((tx) => ({ ...camelize(tx), date: tx.transaction_date }))
      .sort((a, b) => String(b.recordedAt).localeCompare(String(a.recordedAt))),
  };
}

/** Normalise Auth/PostgREST/Edge Function errors into a user-readable message. */
export function readableError(error) {
  const message = error?.message || error?.error || "Something went wrong.";
  if (/invalid login credentials|invalid.*credential/i.test(message)) {
    return "Incorrect username or PIN.";
  }
  if (/email not confirmed/i.test(message))
    return "This account is not ready to sign in.";
  if (/rate limit|too many requests/i.test(message))
    return "Too many failed attempts. Try again later.";
  if (/jwt|token.*expired/i.test(message))
    return "Your session has expired. Please sign in again.";
  return String(message).replace(/^postgres(?:ql)?:\s*/i, "");
}

/* ------------------------------------------------------------------ */
/* Auth                                                                */
/* ------------------------------------------------------------------ */

/** Subscribe to the current Supabase Auth session and its RLS-protected profile. */
export function onAuthProfile(callback) {
  if (!supabaseConfigured || !supabase) {
    callback(null);
    return () => {};
  }

  let active = true;
  let version = 0;
  const resolve = async (user) => {
    const requestVersion = ++version;
    if (!user) {
      if (active) callback(null);
      return;
    }
    try {
      const row = await query(
        supabase.from("profiles").select("*").eq("id", user.id).maybeSingle()
      );
      if (active && requestVersion === version) callback(mapProfile(row));
    } catch (error) {
      console.error("Failed to resolve Supabase profile", error);
      if (active && requestVersion === version) callback(null);
    }
  };

  const { data } = supabase.auth.onAuthStateChange((_event, session) => {
    // Do not issue a PostgREST request inside the Auth callback itself; the
    // SDK documents that this can deadlock token refresh in some browsers.
    setTimeout(() => resolve(session?.user || null), 0);
  });

  return () => {
    active = false;
    data.subscription.unsubscribe();
  };
}

export async function pinLogin({ username, pin }) {
  const name = String(username || "")
    .trim()
    .toLowerCase();
  if (!name || !/^\d{4}$/.test(String(pin || ""))) {
    throw new Error("Incorrect username or PIN.");
  }
  const client = assertConfigured();
  const { data, error } = await client.auth.signInWithPassword({
    email: staffLoginEmail(name),
    password: staffPinPassword(name, pin),
  });
  if (error) throw error;
  return mapProfile(
    await query(client.from("profiles").select("*").eq("id", data.user.id).single())
  );
}

export async function developerLogin({ email, password }) {
  const client = assertConfigured();
  const { data, error } = await client.auth.signInWithPassword({
    email: String(email || "").trim(),
    password,
  });
  if (error) throw error;
  const profile = mapProfile(
    await query(client.from("profiles").select("*").eq("id", data.user.id).single())
  );
  if (profile?.role !== "admin") {
    await client.auth.signOut();
    throw new Error("This account is not a developer account.");
  }
  return profile;
}

export async function signOut() {
  return result(await assertConfigured().auth.signOut());
}

/* ------------------------------------------------------------------ */
/* Account provisioning (accounts Edge Function only)                  */
/* ------------------------------------------------------------------ */

async function accountRequest(body) {
  const client = assertConfigured();
  const { data, error } = await client.functions.invoke("accounts", { body });
  if (error) {
    // FunctionsHttpError exposes the JSON response through context. Preserve
    // its useful server-side validation message when it is available.
    let bodyError = null;
    if (error.context && typeof error.context.json === "function") {
      bodyError = await error.context.json().catch(() => null);
    }
    throw new Error(bodyError?.error || error.message);
  }
  if (data?.error) throw new Error(data.error);
  return data;
}

export function createOwner(payload) {
  return accountRequest({ action: "create_owner", ...payload });
}

export function createStaff(payload) {
  return accountRequest({ action: "create_staff", ...payload });
}

export function resetPin(payload) {
  return accountRequest({ action: "reset_pin", ...payload });
}

export async function addStation(payload) {
  return camelize(
    await rpc("add_station", { p_name: payload.name, p_address: payload.address })
  );
}

/* ------------------------------------------------------------------ */
/* Stations & staff                                                    */
/* ------------------------------------------------------------------ */

export async function listStations(_profile) {
  const rows = await query(assertConfigured().from("stations").select("*").order("name"));
  return rows.map(camelize);
}

export async function listOwners() {
  const rows = await query(
    assertConfigured().from("profiles").select("*").eq("role", "owner").order("name")
  );
  return rows.map(mapProfile);
}

export async function listStaff(profile) {
  const rows = await query(
    assertConfigured()
      .from("profiles")
      .select("*")
      .eq("owner_id", profile.uid)
      .in("role", ["manager", "attendant"])
      .order("created_at")
  );
  return rows.map(mapProfile);
}

/* ------------------------------------------------------------------ */
/* Pumps, nozzles & rates                                              */
/* ------------------------------------------------------------------ */

export async function listPumps(stationId) {
  const client = assertConfigured();
  const [pumps, nozzles] = await Promise.all([
    query(
      client.from("pumps").select("*").eq("station_id", stationId).order("created_at")
    ),
    query(
      client.from("nozzles").select("*").eq("station_id", stationId).order("created_at")
    ),
  ]);
  return { pumps: pumps.map(camelize), nozzles: nozzles.map(camelize) };
}

export async function addPump(stationId, payload) {
  return camelize(
    await rpc("add_pump", { p_station_id: stationId, p_name: payload.name })
  );
}

export async function addNozzle(stationId, payload) {
  return camelize(
    await rpc("add_nozzle", {
      p_station_id: stationId,
      p_pump_id: payload.pumpId,
      p_name: payload.name,
      p_fuel_type: payload.fuelType,
      p_opening_reading: Number(payload.openingReading) || 0,
    })
  );
}

export async function setNozzleState(stationId, nozzleId, state) {
  return camelize(
    await rpc("set_nozzle_state", {
      p_station_id: stationId,
      p_nozzle_id: nozzleId,
      p_state: state,
    })
  );
}

export async function setPumpState(stationId, pumpId, state) {
  return camelize(
    await rpc("set_pump_state", {
      p_station_id: stationId,
      p_pump_id: pumpId,
      p_state: state,
    })
  );
}

export async function getPrices(stationId) {
  const rows = await query(
    assertConfigured()
      .from("fuel_prices")
      .select("*")
      .eq("station_id", stationId)
      .order("effective_from", { ascending: false })
  );
  return rows.map(camelize);
}

export async function setPrice(stationId, payload) {
  return camelize(
    await rpc("set_price", {
      p_station_id: stationId,
      p_fuel_type: payload.fuelType,
      p_price: payload.price,
    })
  );
}

/* ------------------------------------------------------------------ */
/* Atomic shift operations                                              */
/* ------------------------------------------------------------------ */

export async function listShifts(stationId) {
  const rows = await query(
    assertConfigured()
      .from("shifts")
      .select("*, shift_nozzles(*), shift_expenses(*)")
      .eq("station_id", stationId)
      .order("start_time", { ascending: false })
  );
  return rows.map(mapShift);
}

export async function openShift(stationId, payload) {
  const shiftId = await rpc("open_shift", {
    p_station_id: stationId,
    p_nozzle_ids: payload.nozzleIds,
    p_employee_name: payload.employeeName,
  });
  return { shiftId };
}

export async function closeShift(stationId, shiftId, payload) {
  return camelize(
    await rpc("close_shift", {
      p_station_id: stationId,
      p_shift_id: shiftId,
      p_closing_readings: payload.closingReadings || {},
      p_payments: payload.payments || {},
      p_testing: payload.testing || {},
      p_note: payload.note || "",
      p_credit_sales: payload.creditSales || [],
    })
  );
}

export async function addShiftExpense(stationId, shiftId, expense) {
  return camelize(
    await rpc("add_shift_expense", {
      p_station_id: stationId,
      p_shift_id: shiftId,
      p_label: expense.label,
      p_amount: expense.amount,
    })
  );
}

export async function removeShiftExpense(stationId, shiftId, index) {
  return camelize(
    await rpc("remove_shift_expense", {
      p_station_id: stationId,
      p_shift_id: shiftId,
      p_index: index,
    })
  );
}

export async function approveShift(stationId, shiftId) {
  return camelize(
    await rpc("review_shift", {
      p_station_id: stationId,
      p_shift_id: shiftId,
      p_action: "approve",
      p_reason: "",
    })
  );
}

export async function rejectShift(stationId, shiftId, reason) {
  return camelize(
    await rpc("review_shift", {
      p_station_id: stationId,
      p_shift_id: shiftId,
      p_action: "reject",
      p_reason: reason,
    })
  );
}

export async function reviseShift(stationId, shiftId, patch) {
  return camelize(
    await rpc("revise_shift", {
      p_station_id: stationId,
      p_shift_id: shiftId,
      p_expenses: patch.expenses,
      p_testing: patch.testing,
      p_payments: patch.payments,
      p_note: patch.note,
    })
  );
}

export async function setStationState(stationId, state) {
  return camelize(
    await rpc("set_station_state", { p_station_id: stationId, p_state: state })
  );
}

/* ------------------------------------------------------------------ */
/* Tanks & ground stock                                                 */
/* ------------------------------------------------------------------ */

export async function listTanks(stationId) {
  const client = assertConfigured();
  const [tanks, dips] = await Promise.all([
    query(
      client.from("tanks").select("*").eq("station_id", stationId).order("created_at")
    ),
    query(
      client
        .from("tank_readings")
        .select("*")
        .eq("station_id", stationId)
        .order("recorded_at", { ascending: false })
    ),
  ]);
  return { tanks: tanks.map(camelize), dips: dips.map(camelize) };
}

export async function addTank(stationId, tank) {
  return camelize(
    await rpc("add_tank", {
      p_station_id: stationId,
      p_name: tank.name,
      p_fuel_type: tank.fuelType,
      p_capacity: tank.capacity,
      p_current_stock: tank.currentStock,
    })
  );
}

export async function setTankState(stationId, tankId, state) {
  return camelize(
    await rpc("set_tank_state", {
      p_station_id: stationId,
      p_tank_id: tankId,
      p_state: state,
    })
  );
}

export async function updateTank(stationId, tankId, patch) {
  return camelize(
    await rpc("update_tank", {
      p_station_id: stationId,
      p_tank_id: tankId,
      p_name: patch.name,
      p_fuel_type: patch.fuelType,
      p_capacity: patch.capacity,
    })
  );
}

export async function recordDip(stationId, tankId, reading) {
  return camelize(
    await rpc("record_dip", {
      p_station_id: stationId,
      p_tank_id: tankId,
      p_stock_litres: reading.stockLitres,
      p_temperature_c: reading.temperatureC,
      p_water_cm: reading.waterCm === "" ? null : reading.waterCm,
      p_note: reading.note || "",
    })
  );
}

export async function recordDelivery(stationId, tankId, delivery) {
  return camelize(
    await rpc("record_delivery", {
      p_station_id: stationId,
      p_tank_id: tankId,
      p_litres: delivery.litres,
      p_temperature_c: delivery.temperatureC,
      p_invoice: delivery.invoice || "",
      p_note: delivery.note || "",
    })
  );
}

/* ------------------------------------------------------------------ */
/* Credit customers                                                     */
/* ------------------------------------------------------------------ */

export async function listCustomers(stationId) {
  const rows = await query(
    assertConfigured()
      .from("credit_customers")
      .select("*, customer_transactions(*)")
      .eq("station_id", stationId)
      .order("name")
  );
  return rows.map(mapCustomer);
}

export async function createCustomer(stationId, payload) {
  return camelize(
    await rpc("create_customer", {
      p_station_id: stationId,
      p_name: payload.name,
      p_phone: payload.phone || "",
    })
  );
}

export async function addCustomerTransaction(stationId, customerId, tx) {
  return camelize(
    await rpc("record_customer_transaction", {
      p_station_id: stationId,
      p_customer_id: customerId,
      p_type: tx.type,
      p_amount: tx.amount,
      p_note: tx.note || "",
      p_date: tx.date || null,
    })
  );
}

/** Client-side PIN validation, mirroring the accounts Edge Function. */
export { pinProblem };
