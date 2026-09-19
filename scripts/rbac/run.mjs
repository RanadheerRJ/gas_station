#!/usr/bin/env node
/**
 * Behavioural RBAC tests against a real PostgreSQL instance running the real
 * migrations. These assert the security boundary itself rather than the UI.
 *
 * Needs no Docker and no hosted project: a self-contained PostgreSQL binary is
 * fetched on first run, started on a private unix socket, and torn down at the
 * end. Pass --without-rbac to run the same assertions against the initial
 * schema alone, which is the negative control proving they mean something.
 */

import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, "../..");
const WITH_RBAC = !process.argv.includes("--without-rbac");
const PORT = Number(process.env.RBAC_PG_PORT || 55432);

/* ------------------------------------------------------------------ */
/* PostgreSQL + driver bootstrap                                       */
/* ------------------------------------------------------------------ */

const CACHE = resolve(tmpdir(), "station-ledger-rbac-pg");

function run(cmd, args, opts = {}) {
  return new Promise((ok, bad) => {
    const child = spawn(cmd, args, { stdio: "pipe", ...opts });
    let out = "";
    child.stdout?.on("data", (d) => (out += d));
    child.stderr?.on("data", (d) => (out += d));
    child.on("error", bad);
    child.on("close", (code) =>
      code === 0 ? ok(out) : bad(new Error(`${cmd} exited ${code}\n${out}`))
    );
  });
}

async function ensureToolchain() {
  if (!existsSync(resolve(CACHE, "node_modules/@embedded-postgres/linux-x64"))) {
    console.log("Fetching a local PostgreSQL build (first run only)…");
    await run("mkdir", ["-p", CACHE]);
    await writeFile(
      resolve(CACHE, "package.json"),
      JSON.stringify({ name: "rbac-pg", private: true, version: "1.0.0" })
    );
    await run("npm", ["install", "--silent", "@embedded-postgres/linux-x64", "pg"], {
      cwd: CACHE,
    });
  }
  return {
    bin: resolve(CACHE, "node_modules/@embedded-postgres/linux-x64/native/bin"),
    pg: resolve(CACHE, "node_modules/pg/lib/index.js"),
  };
}

const tools = await ensureToolchain();
const { default: pg } = await import(tools.pg);
const dataDir = await mkdtemp(resolve(tmpdir(), "rbac-pgdata-"));
const sockDir = await mkdtemp(resolve(tmpdir(), "rbac-pgsock-"));

async function startPostgres() {
  const pwfile = resolve(dataDir, "..", "rbac-pw.txt");
  await writeFile(pwfile, "postgres");
  await run(resolve(tools.bin, "initdb"), [
    "-D",
    dataDir,
    "-U",
    "postgres",
    "--auth=trust",
    `--pwfile=${pwfile}`,
  ]);
  await run(resolve(tools.bin, "pg_ctl"), [
    "-D",
    dataDir,
    "-l",
    resolve(dataDir, "server.log"),
    "-o",
    `-p ${PORT} -k ${sockDir} -c listen_addresses=`,
    "start",
  ]);
}

async function stopPostgres() {
  await run(resolve(tools.bin, "pg_ctl"), [
    "-D",
    dataDir,
    "-m",
    "immediate",
    "stop",
  ]).catch(() => {});
  await rm(dataDir, { recursive: true, force: true }).catch(() => {});
  await rm(sockDir, { recursive: true, force: true }).catch(() => {});
}

/* ------------------------------------------------------------------ */
/* Fixtures                                                            */
/* ------------------------------------------------------------------ */

const IDS = {
  admin: "00000000-0000-0000-0000-0000000000a1",
  owner: "00000000-0000-0000-0000-0000000000b1",
  owner2: "00000000-0000-0000-0000-0000000000b2",
  manager: "00000000-0000-0000-0000-0000000000c1",
  att1: "00000000-0000-0000-0000-0000000000d1",
  att2: "00000000-0000-0000-0000-0000000000d2",
  station: "00000000-0000-0000-0000-0000000000e1",
  station2: "00000000-0000-0000-0000-0000000000e2",
};

let client;

async function sqlFile(path) {
  await client.query(await readFile(path, "utf8"));
}

/** Run a statement as a signed-in Supabase user. */
async function asUser(uid, sql, params = []) {
  await client.query("begin");
  try {
    await client.query("set local role authenticated");
    await client.query("select set_config('request.jwt.claim.sub', $1, true)", [
      uid ?? "",
    ]);
    const res = await client.query(sql, params);
    await client.query("commit");
    return { rows: res.rows };
  } catch (error) {
    await client.query("rollback").catch(() => {});
    return { error };
  }
}

/** Seed helper that runs as the owner without the RLS role restriction. */
async function asOwner(sql, params = []) {
  await client.query("begin");
  await client.query("select set_config('request.jwt.claim.sub', $1, true)", [IDS.owner]);
  const res = await client.query(sql, params);
  await client.query("commit");
  return res.rows[0];
}

async function seed() {
  for (const [id, email] of [
    [IDS.admin, "dev@example.com"],
    [IDS.owner, "owner@example.com"],
    [IDS.owner2, "owner2@example.com"],
    [IDS.manager, "manager@example.com"],
    [IDS.att1, "att1@example.com"],
    [IDS.att2, "att2@example.com"],
  ]) {
    await client.query("insert into auth.users (id, email) values ($1, $2)", [id, email]);
  }

  // stations.owner_id and profiles.station_id reference each other; the FKs
  // are deferrable, so create both sides in one transaction.
  await client.query("begin");
  await client.query("set constraints all deferred");
  await client.query(
    `insert into public.profiles (id, name, role, owner_id, station_id, username) values
       ($1, 'Dev Admin', 'admin', null, null, 'dev'),
       ($2, 'Olive Owner', 'owner', $2, null, 'olive'),
       ($3, 'Oscar Owner', 'owner', $3, null, 'oscar'),
       ($4, 'Mia Manager', 'manager', $2, $6, 'mia'),
       ($5, 'Amy Attendant', 'attendant', $2, $6, 'amy'),
       ($7, 'Ben Attendant', 'attendant', $2, $6, 'ben')`,
    [IDS.admin, IDS.owner, IDS.owner2, IDS.manager, IDS.att1, IDS.station, IDS.att2]
  );
  await client.query(
    `insert into public.stations (id, name, address, owner_id) values
       ($1, 'Riverside Fuel', '12 River Road', $2),
       ($3, 'Hilltop Fuel', '9 Hill Way', $4)`,
    [IDS.station, IDS.owner, IDS.station2, IDS.owner2]
  );
  await client.query("commit");

  const pump = await asOwner("select public.add_pump($1, 'Pump 1') as r", [IDS.station]);
  await asOwner("select public.set_price($1, 'Petrol', 105.50) as r", [IDS.station]);
  await asOwner("select public.set_price($1, 'Diesel', 92.25) as r", [IDS.station]);
  const n1 = await asOwner(
    "select public.add_nozzle($1, $2, 'N1', 'Petrol', 1000) as r",
    [IDS.station, pump.r.id]
  );
  const n2 = await asOwner(
    "select public.add_nozzle($1, $2, 'N2', 'Diesel', 2000) as r",
    [IDS.station, pump.r.id]
  );
  await asOwner("select public.add_tank($1, 'Tank A', 'Petrol', 20000, 8000) as r", [
    IDS.station,
  ]);
  const cust = await asOwner(
    "select public.create_customer($1, 'Acme Transport', '555') as r",
    [IDS.station]
  );
  return { n1: n1.r.id, n2: n2.r.id, customerId: cust.r.id };
}

/* ------------------------------------------------------------------ */
/* Assertions                                                          */
/* ------------------------------------------------------------------ */

let pass = 0;
const failures = [];

function check(name, ok, detail = "") {
  if (ok) {
    pass++;
    console.log(`  ok   ${name}`);
  } else {
    failures.push(name);
    console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

async function main() {
  await startPostgres();
  client = new pg.Client({
    host: sockDir,
    port: PORT,
    user: "postgres",
    database: "postgres",
  });
  await client.connect();

  await sqlFile(resolve(HERE, "bootstrap.sql"));
  await sqlFile(resolve(REPO, "supabase/migrations/20260919000000_initial_schema.sql"));
  if (WITH_RBAC) {
    await sqlFile(
      resolve(REPO, "supabase/migrations/20260919010000_tighten_role_visibility.sql")
    );
  } else {
    console.log("\n!! negative control: follow-up RBAC migration NOT applied\n");
  }

  const { n1, n2, customerId } = await seed();
  const tank = await asOwner("select id from public.tanks limit 1");
  const tankId = tank.id;

  console.log("\n== attendant shift isolation ==");
  const amyOpen = await asUser(IDS.att1, "select public.open_shift($1, $2, $3) as id", [
    IDS.station,
    [n1],
    "Amy Attendant",
  ]);
  check("attendant can open their own shift", !amyOpen.error, amyOpen.error?.message);
  const amyShift = amyOpen.rows?.[0]?.id;

  const benOpen = await asUser(IDS.att2, "select public.open_shift($1, $2, $3) as id", [
    IDS.station,
    [n2],
    "Ben Attendant",
  ]);
  check("a second attendant can open a shift", !benOpen.error, benOpen.error?.message);
  const benShift = benOpen.rows?.[0]?.id;

  const seen = await asUser(IDS.att1, "select id, employee_name from public.shifts");
  check(
    "attendant sees only their own shift",
    seen.rows?.length === 1 && seen.rows[0].id === amyShift,
    `saw ${seen.rows?.length} rows`
  );
  check(
    "attendant never sees a co-worker's name",
    !seen.rows?.some((r) => r.employee_name === "Ben Attendant")
  );
  const amyNozzles = await asUser(IDS.att1, "select shift_id from public.shift_nozzles");
  check(
    "attendant sees only their own shift nozzles",
    amyNozzles.rows?.length === 1,
    `saw ${amyNozzles.rows?.length}`
  );
  const profiles = await asUser(IDS.att1, "select id from public.profiles");
  check(
    "attendant sees only their own profile",
    profiles.rows?.length === 1 && profiles.rows[0].id === IDS.att1,
    `saw ${profiles.rows?.length}`
  );

  console.log("\n== attendant is blind to financial and stock data ==");
  for (const [label, sql] of [
    ["credit customers", "select * from public.credit_customers"],
    ["customer transactions", "select * from public.customer_transactions"],
    ["tanks", "select * from public.tanks"],
    ["tank readings", "select * from public.tank_readings"],
    ["fuel price history", "select * from public.fuel_prices"],
  ]) {
    const r = await asUser(IDS.att1, sql);
    check(`attendant reads no ${label}`, r.rows?.length === 0, `saw ${r.rows?.length}`);
  }

  console.log("\n== attendant can still start a shift ==");
  const eq = await asUser(
    IDS.att1,
    `select (select count(*) from public.stations) s,
            (select count(*) from public.pumps) p,
            (select count(*) from public.nozzles) n`
  );
  check(
    "attendant sees station, pumps, and nozzles",
    Number(eq.rows?.[0]?.s) === 1 &&
      Number(eq.rows?.[0]?.p) === 1 &&
      Number(eq.rows?.[0]?.n) === 2,
    JSON.stringify(eq.rows?.[0])
  );
  const occ = await asUser(IDS.att1, "select * from public.list_nozzle_occupancy($1)", [
    IDS.station,
  ]);
  check(
    "list_nozzle_occupancy reports both busy nozzles",
    occ.rows?.length === 2,
    occ.error?.message || `saw ${occ.rows?.length}`
  );
  check(
    "list_nozzle_occupancy exposes only nozzle ids",
    occ.rows?.length > 0 && Object.keys(occ.rows[0]).join(",") === "nozzle_id",
    Object.keys(occ.rows?.[0] || {}).join(",")
  );

  console.log("\n== attendant writes are refused ==");
  const otherExpense = await asUser(
    IDS.att1,
    "select public.add_shift_expense($1, $2, 'Tea', 20) as r",
    [IDS.station, benShift]
  );
  check(
    "attendant cannot expense another operator's shift",
    !!otherExpense.error,
    otherExpense.error?.message || "no error raised"
  );
  const ownExpense = await asUser(
    IDS.att1,
    "select public.add_shift_expense($1, $2, 'Tea', 20) as r",
    [IDS.station, amyShift]
  );
  check(
    "attendant can expense their own shift",
    !ownExpense.error,
    ownExpense.error?.message
  );
  const removeOther = await asUser(
    IDS.att1,
    "select public.remove_shift_expense($1, $2, 0) as r",
    [IDS.station, benShift]
  );
  check(
    "attendant cannot remove another operator's expense",
    !!removeOther.error,
    removeOther.error?.message || "no error raised"
  );
  for (const [label, sql, params] of [
    [
      "create a credit customer",
      "select public.create_customer($1, 'Sneaky Ltd', '9') as r",
      [IDS.station],
    ],
    [
      "move a customer balance",
      "select public.record_customer_transaction($1, $2, 'credit', 500, '', current_date) as r",
      [IDS.station, customerId],
    ],
    [
      "record a tank dip",
      "select public.record_dip($1, $2, 7000, 30, null, '') as r",
      [IDS.station, tankId],
    ],
    [
      "record a delivery",
      "select public.record_delivery($1, $2, 1000, 30, '', '') as r",
      [IDS.station, tankId],
    ],
    [
      "approve their own shift",
      "select public.review_shift($1, $2, 'approve', '') as r",
      [IDS.station, amyShift],
    ],
  ]) {
    const r = await asUser(IDS.att1, sql, params);
    check(`attendant cannot ${label}`, !!r.error, r.error?.message || "no error raised");
  }

  const creditClose = await asUser(
    IDS.att1,
    `select public.close_shift($1, $2, $3::jsonb, '{}'::jsonb, '{}'::jsonb, '',
       '[{"name":"Ghost","phone":"111","amount":"250"}]'::jsonb) as r`,
    [IDS.station, amyShift, JSON.stringify({ [n1]: "1100" })]
  );
  check(
    "attendant cannot create credit while closing a shift",
    !!creditClose.error,
    creditClose.error?.message || "no error raised"
  );
  const cleanClose = await asUser(
    IDS.att1,
    `select public.close_shift($1, $2, $3::jsonb, '{"cash":"10555"}'::jsonb, '{}'::jsonb, '', '[]'::jsonb) as r`,
    [IDS.station, amyShift, JSON.stringify({ [n1]: "1100" })]
  );
  check(
    "attendant can close their own shift without credit",
    !cleanClose.error,
    cleanClose.error?.message
  );

  console.log("\n== developer/admin provisions accounts only ==");
  for (const [label, sql] of [
    ["stations", "select * from public.stations"],
    ["shifts", "select * from public.shifts"],
    ["credit customers", "select * from public.credit_customers"],
    ["tanks", "select * from public.tanks"],
    ["fuel prices", "select * from public.fuel_prices"],
    ["pumps", "select * from public.pumps"],
  ]) {
    const r = await asUser(IDS.admin, sql);
    check(`developer reads no ${label}`, r.rows?.length === 0, `saw ${r.rows?.length}`);
  }
  const adminProfiles = await asUser(IDS.admin, "select id from public.profiles");
  check(
    "developer can still list profiles to provision accounts",
    (adminProfiles.rows?.length || 0) > 1,
    `saw ${adminProfiles.rows?.length}`
  );
  const adminDip = await asUser(
    IDS.admin,
    "select public.record_dip($1, $2, 7000, 30, null, '') as r",
    [IDS.station, tankId]
  );
  check(
    "developer cannot record stock movements",
    !!adminDip.error,
    adminDip.error?.message || "no error raised"
  );

  console.log("\n== manager keeps operational and financial access ==");
  const mgr = await asUser(
    IDS.manager,
    `select (select count(*) from public.shifts) sh,
            (select count(*) from public.credit_customers) cu,
            (select count(*) from public.tanks) ta,
            (select count(*) from public.fuel_prices) fp`
  );
  check(
    "manager sees shifts, customers, tanks, and prices",
    Number(mgr.rows?.[0]?.sh) === 2 &&
      Number(mgr.rows?.[0]?.cu) === 1 &&
      Number(mgr.rows?.[0]?.ta) === 1 &&
      Number(mgr.rows?.[0]?.fp) === 2,
    JSON.stringify(mgr.rows?.[0])
  );
  for (const [label, sql, params] of [
    [
      "record a tank dip",
      "select public.record_dip($1, $2, 7000, 30, null, '') as r",
      [IDS.station, tankId],
    ],
    [
      "record a credit transaction",
      "select public.record_customer_transaction($1, $2, 'credit', 500, '', current_date) as r",
      [IDS.station, customerId],
    ],
    [
      "approve a shift",
      "select public.review_shift($1, $2, 'approve', '') as r",
      [IDS.station, amyShift],
    ],
  ]) {
    const r = await asUser(IDS.manager, sql, params);
    check(`manager can ${label}`, !r.error, r.error?.message);
  }

  console.log("\n== owner sees their own stations only ==");
  const own = await asUser(
    IDS.owner,
    `select (select count(*) from public.stations) st,
            (select count(*) from public.shifts) sh,
            (select count(*) from public.tanks) ta`
  );
  check(
    "owner sees their station's data",
    Number(own.rows?.[0]?.st) === 1 &&
      Number(own.rows?.[0]?.sh) === 2 &&
      Number(own.rows?.[0]?.ta) === 1,
    JSON.stringify(own.rows?.[0])
  );
  const other = await asUser(
    IDS.owner2,
    `select (select count(*) from public.shifts) sh,
            (select count(*) from public.credit_customers) cu,
            (select count(*) from public.tanks) ta`
  );
  check(
    "another owner sees none of this station's data",
    Number(other.rows?.[0]?.sh) === 0 &&
      Number(other.rows?.[0]?.cu) === 0 &&
      Number(other.rows?.[0]?.ta) === 0,
    JSON.stringify(other.rows?.[0])
  );
  const crossDip = await asUser(
    IDS.owner2,
    "select public.record_dip($1, $2, 7000, 30, null, '') as r",
    [IDS.station, tankId]
  );
  check(
    "another owner cannot touch this station's stock",
    !!crossDip.error,
    crossDip.error?.message || "no error raised"
  );
  const crossOcc = await asUser(
    IDS.owner2,
    "select * from public.list_nozzle_occupancy($1)",
    [IDS.station]
  );
  check(
    "list_nozzle_occupancy refuses a station you do not belong to",
    !!crossOcc.error,
    crossOcc.error?.message || "no error raised"
  );

  console.log("\n== the anonymous key is granted nothing ==");
  const anon = await asUser(null, "select * from public.list_nozzle_occupancy($1)", [
    IDS.station,
  ]);
  check(
    "anonymous callers cannot call list_nozzle_occupancy",
    !!anon.error,
    anon.error?.message || "no error raised"
  );

  console.log(`\n${pass} passed, ${failures.length} failed`);
  if (failures.length) {
    console.error(`\nFailing checks:\n - ${failures.join("\n - ")}`);
  }
}

let exitCode = 0;
try {
  await main();
  exitCode = failures.length ? 1 : 0;
} catch (error) {
  console.error(error);
  exitCode = 1;
} finally {
  await client?.end().catch(() => {});
  await stopPostgres();
}
process.exit(exitCode);
