#!/usr/bin/env node
/**
 * Behavioural tests for the shift-aware credit ledger, run against a real
 * PostgreSQL instance with every migration applied in order.
 *
 * These assert the security boundary where it actually lives — in SQL — so a
 * direct RPC call from a console is covered, not just the React screens that
 * hide the buttons. Same self-contained PostgreSQL bootstrap as
 * `npm run test:rbac`; no Docker and no hosted project needed.
 *
 *   npm run test:creditdb
 */

import { spawn } from "node:child_process";
import { mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, "../..");
const PORT = Number(process.env.CREDIT_PG_PORT || 55433);
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
const dataDir = await mkdtemp(resolve(tmpdir(), "credit-pgdata-"));
const sockDir = await mkdtemp(resolve(tmpdir(), "credit-pgsock-"));

async function startPostgres() {
  const pwfile = resolve(dataDir, "..", "credit-pw.txt");
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
  owner: "00000000-0000-0000-0000-0000000000b1",
  owner2: "00000000-0000-0000-0000-0000000000b2",
  manager: "00000000-0000-0000-0000-0000000000c1",
  ravi: "00000000-0000-0000-0000-0000000000d1",
  suresh: "00000000-0000-0000-0000-0000000000d2",
  station: "00000000-0000-0000-0000-0000000000e1",
  station2: "00000000-0000-0000-0000-0000000000e2",
};

let client;

async function sqlFile(path) {
  await client.query(await readFile(path, "utf8"));
}

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

async function asOwner(sql, params = []) {
  await client.query("begin");
  await client.query("select set_config('request.jwt.claim.sub', $1, true)", [IDS.owner]);
  const res = await client.query(sql, params);
  await client.query("commit");
  return res.rows[0];
}

async function seed() {
  for (const [id, email] of [
    [IDS.owner, "owner@example.com"],
    [IDS.owner2, "owner2@example.com"],
    [IDS.manager, "manager@example.com"],
    [IDS.ravi, "ravi@example.com"],
    [IDS.suresh, "suresh@example.com"],
  ]) {
    await client.query("insert into auth.users (id, email) values ($1, $2)", [id, email]);
  }

  await client.query("begin");
  await client.query("set constraints all deferred");
  await client.query(
    `insert into public.profiles (id, name, role, owner_id, station_id, username) values
       ($1, 'Olive Owner', 'owner', $1, null, 'olive'),
       ($2, 'Oscar Owner', 'owner', $2, null, 'oscar'),
       ($3, 'Mia Manager', 'manager', $1, $4, 'mia'),
       ($5, 'Ravi', 'attendant', $1, $4, 'ravi'),
       ($6, 'Suresh', 'attendant', $1, $4, 'suresh')`,
    [IDS.owner, IDS.owner2, IDS.manager, IDS.station, IDS.ravi, IDS.suresh]
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
  // Nozzles must be mapped to a tank before a shift can close, so create the
  // tanks first and let add_nozzle pick the single tank for each fuel.
  await asOwner("select public.add_tank($1, 'Tank A', 'Petrol', 20000, 8000) as r", [
    IDS.station,
  ]);
  await asOwner("select public.add_tank($1, 'Tank B', 'Diesel', 20000, 8000) as r", [
    IDS.station,
  ]);
  const n1 = await asOwner(
    "select public.add_nozzle($1, $2, 'N1', 'Petrol', 1000) as r",
    [IDS.station, pump.r.id]
  );
  const n2 = await asOwner(
    "select public.add_nozzle($1, $2, 'N2', 'Diesel', 2000) as r",
    [IDS.station, pump.r.id]
  );
  const ramesh = await asOwner(
    "select public.create_customer($1, 'Ramesh Kumar', '9988000001') as r",
    [IDS.station]
  );
  const lakshmi = await asOwner(
    "select public.create_customer($1, 'Lakshmi Traders', '9988000002') as r",
    [IDS.station]
  );
  return {
    n1: n1.r.id,
    n2: n2.r.id,
    ramesh: ramesh.r.id,
    lakshmi: lakshmi.r.id,
  };
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

const balanceOf = async (id) =>
  Number(
    (
      await asUser(
        IDS.owner,
        "select outstanding_balance b from public.credit_customers where id = $1",
        [id]
      )
    ).rows[0].b
  );

async function main() {
  await startPostgres();
  client = new pg.Client({
    host: sockDir,
    port: PORT,
    user: "postgres",
    database: "postgres",
  });
  await client.connect();

  await sqlFile(resolve(HERE, "../rbac/bootstrap.sql"));
  const dir = resolve(REPO, "supabase/migrations");
  for (const file of (await readdir(dir)).sort()) {
    await sqlFile(resolve(dir, file));
  }

  const { n1, n2, ramesh, lakshmi } = await seed();

  console.log("\n== attendant records credit on their own running shift ==");
  const raviShift = (
    await asUser(IDS.ravi, "select public.open_shift($1, $2, 'Ravi') as id", [
      IDS.station,
      [n1],
    ])
  ).rows[0].id;
  const sureshShift = (
    await asUser(IDS.suresh, "select public.open_shift($1, $2, 'Suresh') as id", [
      IDS.station,
      [n2],
    ])
  ).rows[0].id;

  const added = await asUser(
    IDS.ravi,
    "select public.add_shift_credit($1, $2, $3, 5000, 'Diesel') as r",
    [IDS.station, raviShift, ramesh]
  );
  check(
    "attendant can add credit during their own open shift",
    !added.error,
    added.error?.message
  );
  const txId = added.rows?.[0]?.r?.id;
  check(
    "the entry is linked to the shift and the attendant",
    (
      await asUser(
        IDS.owner,
        "select shift_id, recorded_by, status from public.customer_transactions where id = $1",
        [txId]
      )
    ).rows?.[0]?.shift_id === raviShift,
    "shift link missing"
  );
  check(
    "the attendant is told no balance",
    added.rows?.[0]?.r?.outstandingBalance === null,
    JSON.stringify(added.rows?.[0]?.r)
  );
  check("the customer balance moved by the amount", (await balanceOf(ramesh)) === 5000);

  const foreignShiftAdd = await asUser(
    IDS.ravi,
    "select public.add_shift_credit($1, $2, $3, 100, '') as r",
    [IDS.station, sureshShift, ramesh]
  );
  check(
    "attendant cannot post credit to another attendant's shift",
    !!foreignShiftAdd.error,
    foreignShiftAdd.error?.message || "no error raised"
  );

  for (const [label, amount] of [
    ["zero", 0],
    ["negative", -500],
  ]) {
    const r = await asUser(
      IDS.ravi,
      "select public.add_shift_credit($1, $2, $3, $4, '') as r",
      [IDS.station, raviShift, ramesh, amount]
    );
    check(`a ${label} credit amount is refused`, !!r.error, r.error?.message || "none");
  }

  const crossStation = await asUser(
    IDS.ravi,
    "select public.add_shift_credit($1, $2, $3, 100, '') as r",
    [IDS.station2, raviShift, ramesh]
  );
  check(
    "cross-station credit is refused",
    !!crossStation.error,
    crossStation.error?.message || "no error raised"
  );

  console.log("\n== attendant creates a customer and credits it ==");
  const newCust = await asUser(
    IDS.ravi,
    "select public.create_customer($1, 'Walk-in Transport', '9700000000') as r",
    [IDS.station]
  );
  check("attendant can create a customer", !newCust.error, newCust.error?.message);
  const newCustId = newCust.rows?.[0]?.r?.id;
  const newCredit = await asUser(
    IDS.ravi,
    "select public.add_shift_credit($1, $2, $3, 750, 'Petrol') as r",
    [IDS.station, raviShift, newCustId]
  );
  check(
    "attendant can credit the customer they just created",
    !newCredit.error,
    newCredit.error?.message
  );

  await asUser(IDS.owner, "select public.archive_customer($1) as r", [lakshmi]);
  const archivedCredit = await asUser(
    IDS.ravi,
    "select public.add_shift_credit($1, $2, $3, 300, '') as r",
    [IDS.station, raviShift, lakshmi]
  );
  check(
    "credit against an archived customer is refused",
    !!archivedCredit.error,
    archivedCredit.error?.message || "no error raised"
  );
  await asUser(IDS.owner, "select public.restore_customer($1) as r", [lakshmi]);

  console.log("\n== the attendant stays blind to the ledger ==");
  const blind = await asUser(
    IDS.ravi,
    `select (select count(*) from public.credit_customers) cu,
            (select count(*) from public.customer_transactions) tx,
            (select count(*) from public.customer_transaction_audit) au`
  );
  check(
    "attendant reads no balances, transactions, or audit rows directly",
    Number(blind.rows?.[0]?.cu) === 0 &&
      Number(blind.rows?.[0]?.tx) === 0 &&
      Number(blind.rows?.[0]?.au) === 0,
    JSON.stringify(blind.rows?.[0])
  );
  const mine = await asUser(IDS.ravi, "select * from public.list_shift_credit($1, $2)", [
    IDS.station,
    raviShift,
  ]);
  check(
    "list_shift_credit returns the attendant's own entries",
    mine.rows?.length === 2,
    mine.error?.message || `saw ${mine.rows?.length}`
  );
  check(
    "list_shift_credit exposes no balance column",
    !Object.keys(mine.rows?.[0] || {}).some((k) => k.includes("balance")),
    Object.keys(mine.rows?.[0] || {}).join(",")
  );
  const otherShift = await asUser(
    IDS.ravi,
    "select * from public.list_shift_credit($1, $2)",
    [IDS.station, sureshShift]
  );
  check(
    "attendant cannot list another attendant's shift credit",
    !!otherShift.error,
    otherShift.error?.message || "no error raised"
  );
  const directTable = await asUser(
    IDS.ravi,
    "update public.customer_transactions set amount = 1 where id = $1",
    [txId]
  );
  check(
    "a direct table update by an attendant is refused",
    !!directTable.error,
    directTable.error?.message || "no error raised"
  );
  const directBalance = await asUser(
    IDS.ravi,
    "update public.credit_customers set outstanding_balance = 0 where id = $1",
    [ramesh]
  );
  check(
    "an attendant cannot manipulate a balance directly",
    !!directBalance.error,
    directBalance.error?.message || "no error raised"
  );

  console.log("\n== correcting before approval ==");
  const noReason = await asUser(
    IDS.ravi,
    "select public.update_customer_credit($1, 500, '') as r",
    [txId]
  );
  check(
    "a correction without a reason is refused",
    !!noReason.error,
    noReason.error?.message || "no error raised"
  );
  const edited = await asUser(
    IDS.ravi,
    "select public.update_customer_credit($1, 500, 'Wrong amount') as r",
    [txId]
  );
  check(
    "attendant can correct their own credit before approval",
    !edited.error,
    edited.error?.message
  );
  check(
    "the balance moved by the delta only (-4,500)",
    (await balanceOf(ramesh)) === 500,
    `balance ${await balanceOf(ramesh)}`
  );
  const foreignEdit = await asUser(
    IDS.suresh,
    "select public.update_customer_credit($1, 10, 'nope') as r",
    [txId]
  );
  check(
    "another attendant cannot correct it",
    !!foreignEdit.error,
    foreignEdit.error?.message || "no error raised"
  );
  const foreignVoid = await asUser(
    IDS.suresh,
    "select public.void_customer_credit($1, 'Duplicate entry') as r",
    [txId]
  );
  check(
    "another attendant cannot void it",
    !!foreignVoid.error,
    foreignVoid.error?.message || "no error raised"
  );

  console.log("\n== review indicators and approval lock ==");
  const closed = await asUser(
    IDS.ravi,
    `select public.close_shift($1, $2, $3::jsonb, '{"cash":"100"}'::jsonb, '{}'::jsonb, '', '[]'::jsonb) as r`,
    [IDS.station, raviShift, JSON.stringify({ [n1]: "1100" })]
  );
  check("attendant submits the shift for review", !closed.error, closed.error?.message);
  const review = (
    await asUser(IDS.owner, "select public.shift_credit_review($1, $2) as r", [
      IDS.station,
      raviShift,
    ])
  ).rows?.[0]?.r;
  check(
    "owner review shows the entry count and one modification",
    review?.entries === 2 && review?.modified === 1 && review?.voided === 0,
    JSON.stringify(review)
  );
  check(
    "the correction detail carries old, new, reason, and who",
    Number(review?.items?.[0]?.oldAmount) === 5000 &&
      Number(review?.items?.[0]?.newAmount) === 500 &&
      review?.items?.[0]?.reason === "Wrong amount" &&
      review?.items?.[0]?.actedByName === "Ravi",
    JSON.stringify(review?.items)
  );
  const attendantReview = await asUser(
    IDS.ravi,
    "select public.shift_credit_review($1, $2) as r",
    [IDS.station, raviShift]
  );
  check(
    "an attendant cannot call the review RPC",
    !!attendantReview.error,
    attendantReview.error?.message || "no error raised"
  );

  const approved = await asUser(
    IDS.owner,
    "select public.review_shift($1, $2, 'approve', '') as r",
    [IDS.station, raviShift]
  );
  check("owner approves the shift", !approved.error, approved.error?.message);
  const lateEdit = await asUser(
    IDS.ravi,
    "select public.update_customer_credit($1, 50, 'too late') as r",
    [txId]
  );
  check(
    "attendant cannot edit once the shift is approved",
    !!lateEdit.error && /approved/i.test(lateEdit.error.message),
    lateEdit.error?.message || "no error raised"
  );
  const lateVoid = await asUser(
    IDS.ravi,
    "select public.void_customer_credit($1, 'Duplicate entry') as r",
    [txId]
  );
  check(
    "attendant cannot void once the shift is approved",
    !!lateVoid.error,
    lateVoid.error?.message || "no error raised"
  );

  console.log("\n== owner visibility, correction, and void ==");
  const ownerLedger = await asUser(
    IDS.owner,
    "select * from public.list_customer_transactions($1)",
    [IDS.station]
  );
  check(
    "owner sees the creator and the shift on every entry",
    ownerLedger.rows?.length >= 2 &&
      ownerLedger.rows.every((r) => r.recorded_by_name) &&
      ownerLedger.rows.some((r) => r.shift_label?.includes("Ravi")),
    ownerLedger.error?.message || JSON.stringify(ownerLedger.rows?.[0])
  );
  const byAttendant = await asUser(
    IDS.owner,
    "select * from public.list_customer_transactions($1, null, $2)",
    [IDS.station, IDS.ravi]
  );
  check(
    "the attendant filter narrows the ledger",
    byAttendant.rows?.length === 2,
    `saw ${byAttendant.rows?.length}`
  );
  const byShift = await asUser(
    IDS.owner,
    "select * from public.list_customer_transactions($1, null, null, $2)",
    [IDS.station, raviShift]
  );
  check("the shift filter narrows the ledger", byShift.rows?.length === 2);
  const editedOnly = await asUser(
    IDS.owner,
    "select * from public.list_customer_transactions($1, null, null, null, 'edited')",
    [IDS.station]
  );
  check(
    "the edited filter returns the corrected entry only",
    editedOnly.rows?.length === 1 && editedOnly.rows[0].id === txId,
    `saw ${editedOnly.rows?.length}`
  );
  const dated = await asUser(
    IDS.owner,
    "select * from public.list_customer_transactions($1, null, null, null, 'all', current_date - 5, current_date - 4)",
    [IDS.station]
  );
  check("the date filter excludes today's entries", dated.rows?.length === 0);

  const summaryBefore = (
    await asUser(IDS.owner, "select public.credit_day_summary($1) as r", [IDS.station])
  ).rows?.[0]?.r;
  check(
    "today's summary counts the live entries",
    Number(summaryBefore?.creditGiven) === 1250 && Number(summaryBefore?.entries) === 2,
    JSON.stringify(summaryBefore)
  );

  const voidNoReason = await asUser(
    IDS.owner,
    "select public.void_customer_credit($1, '') as r",
    [txId]
  );
  check(
    "voiding without a reason is refused",
    !!voidNoReason.error,
    voidNoReason.error?.message || "no error raised"
  );
  const voidOtherNoNote = await asUser(
    IDS.owner,
    "select public.void_customer_credit($1, 'Other', '') as r",
    [txId]
  );
  check(
    "reason 'Other' demands a note",
    !!voidOtherNoNote.error,
    voidOtherNoNote.error?.message || "no error raised"
  );
  const voided = await asUser(
    IDS.owner,
    "select public.void_customer_credit($1, 'Duplicate entry') as r",
    [txId]
  );
  check("owner can void an approved-shift entry", !voided.error, voided.error?.message);
  check(
    "the void reversed exactly its own effect",
    (await balanceOf(ramesh)) === 0,
    `balance ${await balanceOf(ramesh)}`
  );
  const twice = await asUser(
    IDS.owner,
    "select public.void_customer_credit($1, 'Duplicate entry') as r",
    [txId]
  );
  check(
    "a voided entry cannot be voided again",
    !!twice.error,
    twice.error?.message || "no error raised"
  );
  const editVoided = await asUser(
    IDS.owner,
    "select public.update_customer_credit($1, 100, 'retry') as r",
    [txId]
  );
  check(
    "a voided entry cannot be edited",
    !!editVoided.error,
    editVoided.error?.message || "no error raised"
  );
  const kept = await asUser(
    IDS.owner,
    `select t.amount, t.status, t.void_reason, t.voided_by_name,
            (select count(*) from public.customer_transaction_audit a where a.transaction_id = t.id) audits
       from public.customer_transactions t where t.id = $1`,
    [txId]
  );
  check(
    "the voided row survives with its history",
    kept.rows?.[0]?.status === "voided" &&
      Number(kept.rows?.[0]?.amount) === 500 &&
      kept.rows?.[0]?.void_reason === "Duplicate entry" &&
      Number(kept.rows?.[0]?.audits) === 3,
    JSON.stringify(kept.rows?.[0])
  );
  const summaryAfter = (
    await asUser(IDS.owner, "select public.credit_day_summary($1) as r", [IDS.station])
  ).rows?.[0]?.r;
  check(
    "today's totals exclude the voided entry",
    Number(summaryAfter?.creditGiven) === 750 && Number(summaryAfter?.entries) === 1,
    JSON.stringify(summaryAfter)
  );

  console.log("\n== cross-station and unauthorised direct calls ==");
  const foreignOwnerRead = await asUser(
    IDS.owner2,
    "select * from public.list_customer_transactions($1)",
    [IDS.station]
  );
  check(
    "another owner cannot read this station's ledger",
    !!foreignOwnerRead.error,
    foreignOwnerRead.error?.message || "no error raised"
  );
  const foreignOwnerVoid = await asUser(
    IDS.owner2,
    "select public.void_customer_credit($1, 'Duplicate entry') as r",
    [txId]
  );
  check(
    "another owner cannot void this station's entry",
    !!foreignOwnerVoid.error,
    foreignOwnerVoid.error?.message || "no error raised"
  );
  const anonSummary = await asUser(null, "select public.credit_day_summary($1) as r", [
    IDS.station,
  ]);
  check(
    "an anonymous caller gets nothing",
    !!anonSummary.error,
    anonSummary.error?.message || "no error raised"
  );

  console.log("\n== manager keeps financial visibility ==");
  const mgrLedger = await asUser(
    IDS.manager,
    "select * from public.list_customer_transactions($1)",
    [IDS.station]
  );
  check("manager can read the ledger", !mgrLedger.error, mgrLedger.error?.message);
  const mgrSummary = await asUser(
    IDS.manager,
    "select public.credit_day_summary($1) as r",
    [IDS.station]
  );
  check("manager can read today's summary", !mgrSummary.error, mgrSummary.error?.message);
  const mgrPayment = await asUser(
    IDS.manager,
    "select public.record_customer_transaction($1, $2, 'credit', 1000, '', current_date) as r",
    [IDS.station, ramesh]
  );
  check(
    "manager can still post a credit the old way",
    !mgrPayment.error,
    mgrPayment.error?.message
  );
  const overPay = await asUser(
    IDS.manager,
    "select public.record_customer_transaction($1, $2, 'payment', 99999, '', current_date) as r",
    [IDS.station, ramesh]
  );
  check(
    "a payment larger than the balance is still refused",
    !!overPay.error,
    overPay.error?.message || "no error raised"
  );

  console.log("\n== concurrent corrections do not corrupt a balance ==");
  const sureshTx = (
    await asUser(
      IDS.suresh,
      "select public.add_shift_credit($1, $2, $3, 1000, '') as r",
      [IDS.station, sureshShift, lakshmi]
    )
  ).rows?.[0]?.r?.id;
  const conflict = new pg.Client({
    host: sockDir,
    port: PORT,
    user: "postgres",
    database: "postgres",
  });
  await conflict.connect();
  await conflict.query("begin");
  await conflict.query("set local role authenticated");
  await conflict.query("select set_config('request.jwt.claim.sub', $1, true)", [
    IDS.owner,
  ]);
  await conflict.query("select public.update_customer_credit($1, 400, 'first') as r", [
    sureshTx,
  ]);
  const racer = asUser(
    IDS.owner,
    "select public.update_customer_credit($1, 200, 'second') as r",
    [sureshTx]
  );
  await new Promise((r) => setTimeout(r, 200));
  await conflict.query("commit");
  await racer;
  await conflict.end();
  check(
    "two overlapping corrections leave the balance consistent",
    (await balanceOf(lakshmi)) === 200,
    `balance ${await balanceOf(lakshmi)}`
  );

  console.log(`\n${pass} passed, ${failures.length} failed`);
  if (failures.length) process.exitCode = 1;
}

try {
  await main();
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  await client?.end().catch(() => {});
  await stopPostgres();
}
