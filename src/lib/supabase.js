import { createClient } from "@supabase/supabase-js";

const url = import.meta.env.VITE_SUPABASE_URL;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

/** A missing URL/key is a setup error, not a reason to serve demo data. */
export const supabaseConfigured = Boolean(url && anonKey);

/**
 * The anonymous key is intentionally browser-visible. Row-level security and
 * the authenticated RPC functions are the security boundary; the service-role
 * key is used only in the deployed accounts Edge Function.
 */
export const supabase = supabaseConfigured
  ? createClient(url, anonKey, {
      auth: {
        storageKey: "station-ledger-auth",
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
  : null;
