/**
 * The Data API grant rule, tested as a rule.
 *
 * Since 30 October 2026 Supabase no longer grants table privileges to the API
 * roles for new tables in "public", so a `create table` without a `GRANT` in the
 * same file is a table the app cannot read: PostgREST answers "permission
 * denied" before RLS is ever consulted. The guard that catches it reads SQL, and
 * reading SQL is exactly the kind of thing that fails silently — a comment
 * stripper that swallows too much reports no tables and therefore no problems.
 * These tests pin the reading, then pin the shipped schema.
 */

import { describe, expect, it } from "vitest";
import { readFile, readdir } from "node:fs/promises";

import {
  checkDataApiGrants,
  stripSqlComments,
  tableGrantStatements,
} from "./dataApiGrants.mjs";

describe("stripSqlComments", () => {
  it("keeps the code after a dashed banner comment", () => {
    // The migrations separate sections with a banner of dashes inside a block
    // comment. Stripping line comments before block comments eats the banner's
    // closing delimiter and then swallows the rest of the file.
    const sql = [
      "/* ------------------------------------------------------------------ */",
      "/* 2. The immutable stock-movement ledger                               */",
      "/* ------------------------------------------------------------------ */",
      "",
      "create table if not exists public.stock_movements (id uuid);",
    ].join("\n");
    expect(stripSqlComments(sql)).toContain(
      "create table if not exists public.stock_movements"
    );
  });

  it("leaves comment markers alone inside a string literal", () => {
    const sql = `select '-- not a comment /* nor this */' as note;`;
    expect(stripSqlComments(sql)).toBe(sql);
  });

  it("treats a doubled quote as an escape, not the end of the literal", () => {
    const sql = `select 'it''s -- still a literal' as note; -- real comment`;
    expect(stripSqlComments(sql)).toContain("it''s -- still a literal");
    expect(stripSqlComments(sql)).not.toContain("real comment");
  });

  it("strips comments inside a dollar-quoted body but keeps its SQL", () => {
    const sql = [
      "create function public.f() returns void language plpgsql as $$",
      "begin",
      "  -- a note about the next line",
      "  insert into public.shifts default values;",
      "end;",
      "$$;",
    ].join("\n");
    const stripped = stripSqlComments(sql);
    expect(stripped).not.toContain("a note about the next line");
    expect(stripped).toContain("insert into public.shifts default values;");
  });

  it("understands nested block comments the way PostgreSQL does", () => {
    expect(stripSqlComments("/* outer /* inner */ still comment */ select 1;")).toBe(
      "  select 1;"
    );
  });
});

describe("tableGrantStatements", () => {
  it("keeps table grants", () => {
    const statements = tableGrantStatements(
      "grant select on public.shifts to authenticated;\n" +
        "grant select, insert, update, delete on public.shifts to service_role;"
    );
    expect(statements).toHaveLength(2);
  });

  it("ignores function and schema grants, which are a different contract", () => {
    const statements = tableGrantStatements(
      "grant execute on function public.open_shift(uuid, uuid[], text) to authenticated;\n" +
        "grant usage on schema public to anon, authenticated, service_role;\n" +
        "revoke all on public.customer_audit from public;"
    );
    expect(statements).toEqual([]);
  });

  it("ignores a grant that only exists in a comment", () => {
    expect(
      tableGrantStatements("-- grant select on public.shifts to service_role;")
    ).toEqual([]);
  });
});

describe("checkDataApiGrants", () => {
  const clean = {
    name: "clean.sql",
    sql: [
      "create table public.tanks (id uuid primary key);",
      "alter table public.tanks enable row level security;",
      "grant select on public.tanks to authenticated;",
      "grant select, insert, update, delete on public.tanks to service_role;",
    ].join("\n"),
  };

  it("accepts a table that names both API roles", () => {
    expect(checkDataApiGrants([clean])).toEqual({
      ungranted: [],
      anonGrants: [],
      tables: 1,
    });
  });

  it("reports a table with no grant at all — the post-October failure mode", () => {
    const { ungranted, tables } = checkDataApiGrants([
      { name: "bare.sql", sql: "create table public.tanks (id uuid primary key);" },
    ]);
    expect(tables).toBe(1);
    expect(ungranted).toEqual([
      "bare.sql: tanks has no grant to authenticated, service_role",
    ]);
  });

  it("reports each role that is missing on its own", () => {
    const { ungranted } = checkDataApiGrants([
      {
        name: "half.sql",
        sql:
          "create table if not exists public.tanks (id uuid);\n" +
          "grant select on public.tanks to authenticated;",
      },
    ]);
    expect(ungranted).toEqual(["half.sql: tanks has no grant to service_role"]);
  });

  it("accepts one grant statement covering several tables", () => {
    const { ungranted, tables } = checkDataApiGrants([
      {
        name: "multi.sql",
        sql:
          "create table public.tanks (id uuid);\n" +
          "create table public.pumps (id uuid);\n" +
          "grant select on public.tanks, public.pumps to authenticated;\n" +
          "grant select, insert, update, delete on public.tanks, public.pumps to service_role;",
      },
    ]);
    expect(tables).toBe(2);
    expect(ungranted).toEqual([]);
  });

  it("refuses any table grant to anon: no policy is `to anon`, so it buys nothing", () => {
    const { anonGrants } = checkDataApiGrants([
      { name: "anon.sql", sql: "grant select on public.tanks to anon;" },
    ]);
    expect(anonGrants).toHaveLength(1);
    expect(anonGrants[0]).toContain("grant select on public.tanks to anon");
  });

  it("does not mistake a schema grant for a table grant to anon", () => {
    const { anonGrants } = checkDataApiGrants([
      {
        name: "schema.sql",
        sql: "grant usage on schema public to anon, authenticated, service_role;",
      },
    ]);
    expect(anonGrants).toEqual([]);
  });

  it("accepts a bulk grant covering every table in the same file", () => {
    const { ungranted } = checkDataApiGrants([
      {
        name: "bulk.sql",
        sql:
          "create table public.tanks (id uuid);\n" +
          "grant select on all tables in schema public to authenticated;\n" +
          "grant select, insert, update, delete on all tables in schema public to service_role;",
      },
    ]);
    expect(ungranted).toEqual([]);
  });

  it("does not mistake a table name inside a function grant for a table grant", () => {
    const { ungranted } = checkDataApiGrants([
      {
        name: "rpc.sql",
        sql:
          "create table public.tanks (id uuid);\n" +
          "grant execute on function public.add_tank(uuid, text, text, numeric, numeric) to authenticated;",
      },
    ]);
    expect(ungranted).toEqual([
      "rpc.sql: tanks has no grant to authenticated, service_role",
    ]);
  });
});

describe("the shipped schema", () => {
  it("grants every table it creates to authenticated and service_role, and none to anon", async () => {
    const migrationFiles = (
      await readdir(new URL("../supabase/migrations", import.meta.url))
    )
      .filter((name) => name.endsWith(".sql"))
      .sort();
    const sources = await Promise.all(
      [
        ...migrationFiles.map((name) => `../supabase/migrations/${name}`),
        "../scripts/hotfix_stock_ledger.sql",
        "../scripts/hotfix_credit_customer_archive.sql",
      ].map(async (path) => ({
        name: path.replace(/^\.\.\//, ""),
        sql: await readFile(new URL(path, import.meta.url), "utf8"),
      }))
    );

    const { ungranted, anonGrants, tables } = checkDataApiGrants(sources);
    expect({ ungranted, anonGrants }).toEqual({ ungranted: [], anonGrants: [] });
    // 12 tables in the initial schema, plus stock_movements, customer_audit,
    // and customer_transaction_audit — counted again in the two hotfix scripts.
    expect(tables).toBe(17);
  });
});
