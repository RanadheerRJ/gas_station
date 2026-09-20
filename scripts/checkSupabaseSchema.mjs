#!/usr/bin/env node
/**
 * Fast migration contract check for CI. Database-level behavioural coverage
 * belongs in supabase/tests/database_test.sql; this guard makes sure a rename
 * cannot silently leave the browser API calling a non-existent RPC, and that
 * the RBAC boundary is not quietly removed.
 */

import { readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";

const RBAC = "supabase/migrations/20260919010000_tighten_role_visibility.sql";

const rbac = await readFile(resolve(RBAC), "utf8");
const migrationFiles = (await readdir(resolve("supabase/migrations")))
  .filter((name) => name.endsWith(".sql"))
  .sort();
// RPCs can be introduced by any forward-only migration.
const migration = (
  await Promise.all(
    migrationFiles.map((name) => readFile(resolve("supabase/migrations", name), "utf8"))
  )
).join("\n");
const api = await readFile(resolve("src/lib/api.js"), "utf8");

const required = [
  "enable row level security",
  "security definer",
  "revoke execute on all functions",
  "shift_nozzles_one_open_shift",
  "create or replace function public.open_shift",
  "create or replace function public.close_shift",
  "create or replace function public.record_customer_transaction",
  "for update",
  "create or replace function public.record_dip",
  "create or replace function public.record_delivery",
  "create or replace function public.provision_owner",
  "to authenticated",
];

/**
 * The role matrix is the security boundary, so each rule gets an explicit
 * guard. Weakening one of these should fail CI rather than ship.
 */
const rbacRequired = [
  // Developers provision accounts only; they must not read station data.
  "create or replace function public.can_access_station",
  // Owner/manager-only gate for financial and stock reads.
  "create or replace function public.can_manage_station",
  "create or replace function public.assert_manager_station",
  // Attendants may only act on their own shift.
  "create or replace function public.assert_own_shift",
  // Anonymous availability for the start-shift screen.
  "create or replace function public.list_nozzle_occupancy",
  // Row-level backstop against direct RPC calls.
  "create or replace function public.guard_attendant_writes",
  "shifts_guard_attendant",
  "credit_customers_guard_attendant",
  "tanks_guard_attendant",
  "fuel_prices_guard_attendant",
];

/** Reads that must be gated on can_manage_station, not mere station access. */
const managerOnlyPolicies = [
  "prices_read",
  "customers_read",
  "customer_transactions_read",
];

const missing = required.filter(
  (needle) => !migration.toLowerCase().includes(needle.toLowerCase())
);
const missingRbac = rbacRequired.filter(
  (needle) => !rbac.toLowerCase().includes(needle.toLowerCase())
);

const weakPolicies = managerOnlyPolicies.filter((name) => {
  const match = rbac.match(new RegExp(`create policy ${name}[\\s\\S]*?;`, "i"));
  return !match || !/can_manage_station/i.test(match[0]);
});

const rpcNames = [...api.matchAll(/rpc\("([a-z_]+)"/g)].map((match) => match[1]);
const missingRpc = rpcNames.filter(
  (name) => !migration.includes(`function public.${name}(`)
);

if (missing.length || missingRbac.length || weakPolicies.length || missingRpc.length) {
  const problems = [
    ...(missing.length ? [`schema: ${missing.join(", ")}`] : []),
    ...(missingRbac.length ? [`RBAC: ${missingRbac.join(", ")}`] : []),
    ...(weakPolicies.length
      ? [`policies not owner/manager gated: ${weakPolicies.join(", ")}`]
      : []),
    ...(missingRpc.length ? [`RPCs: ${missingRpc.join(", ")}`] : []),
  ];
  console.error(`Supabase schema contract is missing ${problems.join("; ")}`);
  process.exit(1);
}

console.log(
  `Supabase schema contract: OK (${rpcNames.length} browser RPCs, ` +
    `${rbacRequired.length} RBAC guards, ${managerOnlyPolicies.length} owner/manager reads)`
);
