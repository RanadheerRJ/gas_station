import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/*
 * Bumped on every change. Included in the unknown-action error so a stale
 * hosted function is identifiable straight from the browser message — the
 * exact symptom of a deploy that predates a newly shipped action.
 */
const FUNCTION_VERSION = "2026-09-20.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const WEAK_PINS = new Set([
  "0000",
  "1111",
  "2222",
  "3333",
  "4444",
  "5555",
  "6666",
  "7777",
  "8888",
  "9999",
  "1234",
  "2345",
  "3456",
  "4567",
  "5678",
  "6789",
  "0123",
  "9876",
  "8765",
  "7654",
  "6543",
  "5432",
  "4321",
  "3210",
  "1212",
  "1122",
  "6969",
  "1004",
  "2000",
  "2001",
  "1010",
]);

function response(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function fail(message: string, status = 400) {
  return response({ error: message }, status);
}

function required(value: unknown, field: string, max = 120) {
  const text = typeof value === "string" ? value.trim() : "";
  if (!text || text.length > max) throw new Error(`${field} is required.`);
  return text;
}

function validatePin(value: unknown) {
  const pin = String(value ?? "");
  if (!/^\d{4}$/.test(pin)) throw new Error("The PIN must be exactly 4 digits.");
  if (WEAK_PINS.has(pin)) {
    throw new Error(
      "That PIN is too easy to guess. Avoid repeated digits and simple runs."
    );
  }
  return pin;
}

/** A reachable phone number: required, and 10–15 digits once decoration goes. */
function validatePhone(value: unknown) {
  const text = required(value, "phone", 24);
  const digits = text.replace(/\D/g, "");
  if (digits.length < 10 || digits.length > 15) {
    throw new Error("Enter a valid phone number (10-15 digits).");
  }
  return text;
}

function slugify(name: string) {
  return (
    name
      .normalize("NFKD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]/g, "")
      .slice(0, 20) || "user"
  );
}

/**
 * A staff username maps to a non-deliverable Auth email. The app never sends
 * it email; Auth stores a bcrypt/argon hash of this derived password, so raw
 * four-digit PINs are never persisted in public tables or logs.
 */
function loginEmail(username: string) {
  return `${username}@station-ledger.invalid`;
}

function pinPassword(username: string, pin: string) {
  return `station-ledger/${username}/${pin}`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return fail("Use POST.", 405);

  try {
    const url = Deno.env.get("SUPABASE_URL");
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !anonKey || !serviceKey)
      return fail("Function environment is incomplete.", 500);

    const token = req.headers.get("Authorization")?.replace(/^Bearer\s+/i, "");
    if (!token) return fail("Sign in first.", 401);

    const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
    const { data: authData, error: authError } = await admin.auth.getUser(token);
    if (authError || !authData.user) return fail("Sign in first.", 401);

    const actorId = authData.user.id;
    const { data: actor, error: actorError } = await admin
      .from("profiles")
      .select("id, role, station_id, username")
      .eq("id", actorId)
      .single();
    if (actorError || !actor) return fail("Your account is not provisioned.", 403);

    const body = await req.json();
    const action = body?.action;

    if (action === "reset_own_pin") {
      const currentPin = String(body?.currentPin ?? "");
      const pin = validatePin(body?.pin);
      if (!actor.username) {
        return fail("This account does not sign in with a PIN.", 400);
      }
      if (!/^\d{4}$/.test(currentPin)) {
        return fail("Enter your current 4-digit PIN.", 400);
      }
      // Prove the caller knows the current PIN before replacing it. This goes
      // through Auth exactly like a sign-in: the service key cannot test a
      // password, so the anon client does the check.
      const anon = createClient(url, anonKey, { auth: { persistSession: false } });
      const { error: checkError } = await anon.auth.signInWithPassword({
        email: loginEmail(actor.username),
        password: pinPassword(actor.username, currentPin),
      });
      if (checkError) return fail("Your current PIN is not correct.", 403);
      const { error } = await admin.auth.admin.updateUserById(actorId, {
        password: pinPassword(actor.username, pin),
      });
      if (error) throw error;
      return response({ ok: true });
    }

    if (action === "reset_pin") {
      const targetId = required(body?.uid, "uid");
      const pin = validatePin(body?.pin);
      const { data: target, error: targetError } = await admin
        .from("profiles")
        .select("id, role, owner_id, station_id, username")
        .eq("id", targetId)
        .single();
      if (targetError || !target) return fail("That account does not exist.", 404);
      if (!target.username) {
        return fail("That account does not sign in with a PIN.", 400);
      }

      // Authority matrix, mirroring the role matrix in the README:
      //   developer : any PIN account (owner, manager, or attendant)
      //   owner     : the managers and attendants they issued logins to
      //   manager   : the staff posted to their station, never themselves
      // Anyone else must use reset_own_pin, which checks the current PIN.
      const permitted =
        actor.role === "admin" ||
        (actor.role === "owner" &&
          target.owner_id === actorId &&
          (target.role === "manager" || target.role === "attendant")) ||
        (actor.role === "manager" &&
          target.id !== actorId &&
          actor.station_id != null &&
          target.station_id === actor.station_id &&
          (target.role === "manager" || target.role === "attendant"));
      if (!permitted) return fail("You cannot reset that account's PIN.", 403);

      const { error } = await admin.auth.admin.updateUserById(target.id, {
        password: pinPassword(target.username, pin),
      });
      if (error) throw error;
      return response({ ok: true, username: target.username });
    }

    if (action !== "create_owner" && action !== "create_staff") {
      return fail(`Unknown account action. (accounts function ${FUNCTION_VERSION})`);
    }

    if (action === "create_owner" && actor.role !== "admin") {
      return fail("Developer access required.", 403);
    }
    if (action === "create_staff" && actor.role !== "owner") {
      return fail("Owner access required.", 403);
    }

    const name = required(
      action === "create_owner" ? body?.ownerName : body?.name,
      "name"
    );
    const phone = validatePhone(body?.phone);
    const pin = validatePin(body?.pin);
    const stationId =
      action === "create_staff" ? required(body?.stationId, "stationId") : null;
    const role = action === "create_staff" ? required(body?.role, "role", 16) : "owner";
    if (action === "create_staff" && role !== "manager" && role !== "attendant") {
      return fail("Role must be manager or attendant.");
    }
    const stationName =
      action === "create_owner" ? required(body?.stationName, "stationName") : null;
    const address =
      action === "create_owner" ? required(body?.address, "address", 300) : null;

    const base = slugify(name);
    for (let attempt = 0; attempt < 50; attempt += 1) {
      const username = attempt ? `${base}${attempt + 1}` : base;
      const { data: taken, error: lookupError } = await admin
        .from("profiles")
        .select("id")
        .eq("username", username)
        .maybeSingle();
      if (lookupError) throw lookupError;
      if (taken) continue;

      const { data: created, error: createError } = await admin.auth.admin.createUser({
        email: loginEmail(username),
        password: pinPassword(username, pin),
        email_confirm: true,
        user_metadata: { name },
      });
      // A concurrent request may have claimed the derived email. Try the next suffix.
      if (createError || !created.user) {
        if (createError?.message?.toLowerCase().includes("already")) continue;
        throw createError ?? new Error("Could not create the account.");
      }

      const rpc =
        action === "create_owner"
          ? await admin.rpc("provision_owner", {
              p_user_id: created.user.id,
              p_name: name,
              p_phone: phone,
              p_username: username,
              p_station_name: stationName,
              p_address: address,
            })
          : await admin.rpc("provision_staff", {
              p_user_id: created.user.id,
              p_owner_id: actorId,
              p_station_id: stationId,
              p_name: name,
              p_phone: phone,
              p_username: username,
              p_role: role,
            });

      if (!rpc.error) {
        const result = Array.isArray(rpc.data) ? rpc.data[0] : rpc.data;
        return response({
          uid: created.user.id,
          username,
          stationId: result?.station_id ?? stationId,
        });
      }

      await admin.auth.admin.deleteUser(created.user.id);
      // 23505 is the only retryable error here: another account claimed the username.
      if (rpc.error.code === "23505") continue;
      throw rpc.error;
    }

    return fail("Could not allocate a username. Please try again.", 429);
  } catch (error) {
    console.error("accounts function failed", error);
    return fail(error instanceof Error ? error.message : "Account request failed.", 500);
  }
});
