#!/usr/bin/env node
/** Apply the repository's forward-only migrations through Supabase's Management API.
 *
 * This deliberately does not use the database password. The API executes each
 * migration and records its version in the same transaction, like `supabase db
 * push`, while the ledger checks below prevent replaying an ambiguous database.
 */

import { readFile, readdir } from "node:fs/promises";
import { resolve } from "node:path";

const API = "https://api.supabase.com/v1/projects";
const ROOT = resolve(new URL("..", import.meta.url).pathname);
const MIGRATIONS = resolve(ROOT, "supabase/migrations");

export async function managementApiRunner(projectId, accessToken, query) {
  if (!projectId || !accessToken) {
    throw new Error(
      "Management API credentials are missing. Set SUPABASE_PROJECT_ID and SUPABASE_ACCESS_TOKEN; " +
        "fallbacks are the Supabase dashboard SQL Editor or a local `supabase db push`."
    );
  }
  const response = await fetch(`${API}/${encodeURIComponent(projectId)}/database/query`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query }),
  });
  const body = await response.text();
  if (!response.ok) {
    throw new Error(
      `Supabase Management API returned ${response.status}: ${body}. ` +
        "Fallbacks: paste the migration into the Supabase dashboard SQL Editor " +
        "or run `supabase db push` locally with the database password."
    );
  }
  try {
    return body ? JSON.parse(body) : null;
  } catch {
    throw new Error(`Supabase Management API returned invalid JSON: ${body}`);
  }
}

async function migrationFiles() {
  return (await readdir(MIGRATIONS))
    .filter((name) => /^\d{14}_.+\.sql$/.test(name))
    .sort();
}

function rows(result) {
  if (Array.isArray(result)) return result;
  if (Array.isArray(result?.result)) return result.result;
  if (Array.isArray(result?.data)) return result.data;
  return [];
}

export async function assertLedgerTrustworthy(runQuery, files) {
  const [{ exists } = {}] = rows(
    await runQuery(
      "select exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = 'stations') as exists"
    )
  );
  const applied = rows(
    await runQuery(
      "select version from supabase_migrations.schema_migrations order by version"
    )
  ).map((row) => String(row.version));

  if ((exists === true || exists === "true") && applied.length === 0) {
    throw new Error(
      "Refusing to apply migrations: the public schema exists but the migration ledger is empty. " +
        "Reconcile supabase_migrations.schema_migrations manually before deploying."
    );
  }
  const newestApplied = applied.at(-1);
  const oldestPending = files.find((file) => !applied.includes(file.slice(0, 14)));
  if (newestApplied && oldestPending && oldestPending.slice(0, 14) < newestApplied) {
    throw new Error(
      `Refusing to apply migrations: pending ${oldestPending.slice(0, 14)} is older than ` +
        `applied ${newestApplied}. The ledger does not describe a trustworthy linear history.`
    );
  }
  return new Set(applied);
}

export async function applyMigrations({ projectId, accessToken } = {}) {
  const files = await migrationFiles();
  const runQuery = (query) => managementApiRunner(projectId, accessToken, query);
  const applied = await assertLedgerTrustworthy(runQuery, files);
  const pending = files.filter((file) => !applied.has(file.slice(0, 14)));
  console.log(`Migration ledger: ${applied.size} applied, ${pending.length} pending.`);

  for (const file of pending) {
    const version = file.slice(0, 14);
    const sql = await readFile(resolve(MIGRATIONS, file), "utf8");
    // The migration and its ledger row are atomic. Identical reruns are safe
    // because the ledger is checked before this loop and the insert is guarded.
    await runQuery(
      `begin;\n${sql}\ninsert into supabase_migrations.schema_migrations(version)\nvalues ('${version}')\non conflict (version) do nothing;\ncommit;`
    );
    console.log(`Applied ${file}`);
  }
  return pending;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  await applyMigrations({
    projectId: process.env.SUPABASE_PROJECT_ID,
    accessToken: process.env.SUPABASE_ACCESS_TOKEN,
  });
}
