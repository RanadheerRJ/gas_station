/**
 * Data API exposure. From 30 October 2026 Supabase no longer auto-grants table
 * privileges to the API roles for new tables in "public", so SQL that creates a
 * table without an explicit GRANT ships a table the browser and the Edge
 * Function cannot reach: PostgREST answers "permission denied for table …" no
 * matter what the RLS policies say. Replays are included — a new project, a
 * preview branch, and `supabase db reset` all re-create every table here.
 *
 * The contract this repo pins:
 *   authenticated — SELECT, and nothing else. Writes go through SECURITY
 *                   DEFINER RPCs, which run as their definer.
 *   service_role  — SELECT/INSERT/UPDATE/DELETE for the accounts Edge Function.
 *   anon          — no table grants at all. Every policy is `to authenticated`,
 *                   so an anonymous read could only return zero rows.
 *
 * These are the pure decisions; `scripts/checkSupabaseSchema.mjs` feeds them the
 * repository's SQL and fails CI on anything they report, and
 * `scripts/dataApiGrants.test.js` pins them so the guard cannot go blind
 * silently.
 */

const TABLE_PRIVILEGES =
  /^\s*grant\s+(?:all(?:\s+privileges)?|select|insert|update|delete|truncate|references|trigger)\b/i;

const DOLLAR_TAG = /^\$\$|^\$[A-Za-z_][A-Za-z0-9_]*\$/;

/**
 * Remove SQL comments without touching string literals.
 *
 * Stripping line comments first and block comments second is not enough here:
 * the migrations use banner rules made of dashes inside a block comment, so the
 * line-comment pass eats the banner's closing delimiter and the block-comment
 * pass then swallows the rest of the file — hiding every table in it. This
 * scanner walks the text once instead, keeps quoted literals (including `$$`
 * function bodies, whose own comments are stripped recursively), and handles
 * nested block comments the way PostgreSQL does.
 */
export function stripSqlComments(sql) {
  let out = "";
  let i = 0;

  while (i < sql.length) {
    const two = sql.slice(i, i + 2);

    if (sql[i] === "'") {
      let j = i + 1;
      while (j < sql.length) {
        if (sql[j] === "'") {
          if (sql[j + 1] === "'") {
            j += 2; // '' is an escaped quote, not the end of the literal
            continue;
          }
          break;
        }
        j += 1;
      }
      out += sql.slice(i, j + 1);
      i = j + 1;
      continue;
    }

    const tag = sql.slice(i).match(DOLLAR_TAG)?.[0];
    if (tag) {
      const close = sql.indexOf(tag, i + tag.length);
      const stop = close === -1 ? sql.length : close + tag.length;
      out += tag + stripSqlComments(sql.slice(i + tag.length, stop - tag.length)) + tag;
      i = stop;
      continue;
    }

    if (two === "--") {
      const eol = sql.indexOf("\n", i);
      i = eol === -1 ? sql.length : eol;
      out += " ";
      continue;
    }

    if (two === "/*") {
      let depth = 1;
      let j = i + 2;
      while (j < sql.length && depth > 0) {
        if (sql.slice(j, j + 2) === "/*") {
          depth += 1;
          j += 2;
        } else if (sql.slice(j, j + 2) === "*/") {
          depth -= 1;
          j += 2;
        } else {
          j += 1;
        }
      }
      i = j;
      out += " ";
      continue;
    }

    out += sql[i];
    i += 1;
  }

  return out;
}

const BULK_TABLES = /\bon\s+all\s+tables\s+in\s+schema\s+public\b/i;

/** Only GRANTs that name a table: functions and schemas are a separate contract. */
function tableGrants(cleanedSql) {
  return cleanedSql
    .split(";")
    .filter(
      (statement) =>
        TABLE_PRIVILEGES.test(statement) && !/\bgrant\s+usage\b/i.test(statement)
    );
}

export function tableGrantStatements(sql) {
  return tableGrants(stripSqlComments(sql));
}

/** A statement covers a table by naming it, or by granting on every table. */
function coversTable(statement, table) {
  return BULK_TABLES.test(statement) || new RegExp(`\\b${table}\\b`, "i").test(statement);
}

/**
 * Every table this repo creates must name the API roles it is exposed to, in
 * the same file that creates it, or a fresh replay (new project, preview
 * branch, `supabase db reset`) answers the Data API with "permission denied".
 */
export function checkDataApiGrants(sources) {
  const ungranted = [];
  const anonGrants = [];
  let tables = 0;

  for (const { name, sql } of sources) {
    const cleaned = stripSqlComments(sql);
    const statements = tableGrants(cleaned);
    const created = [
      ...cleaned.matchAll(
        /create\s+table\s+(?:if\s+not\s+exists\s+)?public\.([a-z_][a-z0-9_]*)/gi
      ),
    ].map((match) => match[1]);
    tables += created.length;

    for (const table of created) {
      const missingRole = ["authenticated", "service_role"].filter(
        (role) =>
          !statements.some(
            (statement) =>
              coversTable(statement, table) &&
              new RegExp(`\\bto\\b[^;]*\\b${role}\\b`, "i").test(statement)
          )
      );
      if (missingRole.length) {
        ungranted.push(`${name}: ${table} has no grant to ${missingRole.join(", ")}`);
      }
    }

    for (const statement of statements) {
      if (/\bto\b[^;]*\banon\b/i.test(statement)) {
        anonGrants.push(
          `${name}: ${statement.replace(/\s+/g, " ").trim().slice(0, 120)}`
        );
      }
    }
  }

  return { ungranted, anonGrants, tables };
}
