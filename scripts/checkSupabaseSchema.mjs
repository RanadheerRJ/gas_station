#!/usr/bin/env node
/**
 * Fast migration contract check for CI. Database-level behavioural coverage
 * belongs in supabase/tests/database_test.sql; this guard makes sure a rename
 * cannot silently leave the browser API calling a non-existent RPC.
 */

import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

const migration = await readFile(
  resolve("supabase/migrations/20260919000000_initial_schema.sql"),
  "utf8"
);
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

const missing = required.filter(
  (needle) => !migration.toLowerCase().includes(needle.toLowerCase())
);
const rpcNames = [...api.matchAll(/rpc\("([a-z_]+)"/g)].map((match) => match[1]);
const missingRpc = rpcNames.filter(
  (name) => !migration.includes(`function public.${name}(`)
);

if (missing.length || missingRpc.length) {
  const problems = [
    ...(missing.length ? [`schema: ${missing.join(", ")}`] : []),
    ...(missingRpc.length ? [`RPCs: ${missingRpc.join(", ")}`] : []),
  ];
  console.error(`Supabase schema contract is missing ${problems.join("; ")}`);
  process.exit(1);
}

console.log(`Supabase schema contract: OK (${rpcNames.length} browser RPCs)`);
