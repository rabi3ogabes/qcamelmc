#!/usr/bin/env node
// Replays every Supabase migration against an embedded Postgres (PGlite) and
// runs the SQL tests in tests/db. No Docker needed.
//
//   npm run test:db                 # everything
//   npm run test:db -- 30-payments  # only files whose name contains the filter
//
// Flow: Supabase shim -> legacy migrations -> production-shaped legacy data ->
// new migrations -> helpers -> tests. The legacy data proves the data
// migration is lossless.

import { PGlite } from "@electric-sql/pglite";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const MIGRATIONS = join(ROOT, "supabase", "migrations");
const TESTS = join(ROOT, "tests", "db");
// Migrations at or after this timestamp are the hardening set; earlier ones are
// the schema production already runs.
const BOUNDARY = process.env.LEGACY_BOUNDARY ?? "20261009";

const filter = process.argv[2];
const read = (...p) => readFileSync(join(...p), "utf8");
const sqlFiles = (dir, pattern = /\.sql$/) =>
  readdirSync(dir).filter((f) => pattern.test(f)).sort();

const db = new PGlite();
let failed = false;

async function apply(label, sql) {
  try {
    await db.exec(sql);
  } catch (error) {
    console.error(`\n✗ ${label}\n  ${error.message}`);
    process.exit(1);
  }
}

await apply("tests/db/00-supabase-shim.sql", read(TESTS, "00-supabase-shim.sql"));

// SKIP_MIGRATION=<fragment> leaves out matching files: it proves a test fails
// without the migration it is meant to cover.
const SKIP = process.env.SKIP_MIGRATION;
const migrations = sqlFiles(MIGRATIONS).filter((f) => !SKIP || !f.includes(SKIP));
const legacy = migrations.filter((f) => f < BOUNDARY);
const hardening = migrations.filter((f) => f >= BOUNDARY);
for (const f of legacy) await apply(`migration ${f}`, read(MIGRATIONS, f));
await apply("tests/db/02-legacy-seed.sql", read(TESTS, "02-legacy-seed.sql"));
for (const f of hardening) await apply(`migration ${f}`, read(MIGRATIONS, f));
await apply("tests/db/01-helpers.sql", read(TESTS, "01-helpers.sql"));

console.log(`Applied ${legacy.length} existing + ${hardening.length} new migrations\n`);

const tests = sqlFiles(TESTS, /\.test\.sql$/).filter((f) => !filter || f.includes(filter));
let totalAssertions = 0;
let legacyDataCleared = false;

for (const file of tests) {
  // Only the legacy-data test may see the production-shaped rows; every other
  // file starts from an empty database no matter which files are selected.
  if (!file.startsWith("05-") && !legacyDataCleared) {
    await db.exec("TRUNCATE public.events, public.customers CASCADE");
    legacyDataCleared = true;
  }
  const notices = [];
  try {
    await db.exec(read(TESTS, file), { onNotice: (n) => notices.push(n.message) });
    const passed = notices.filter((m) => m.startsWith("ok - ")).length;
    totalAssertions += passed;
    console.log(`✓ ${file}  (${passed} assertions)`);
  } catch (error) {
    failed = true;
    const passed = notices.filter((m) => m.startsWith("ok - ")).length;
    console.log(`✗ ${file}  (${passed} assertions passed before the failure)`);
    const last = notices.filter((m) => m.startsWith("ok - ")).slice(-2);
    for (const m of last) console.log(`    ${m}`);
    console.log(`    ${error.message.split("\n")[0]}`);
    await db.exec("ROLLBACK").catch(() => {});
    await db.exec("RESET ROLE").catch(() => {});
  }
}

await db.close();
console.log(failed ? "\nDB tests FAILED" : `\nAll DB tests passed (${totalAssertions} assertions)`);
process.exit(failed ? 1 : 0);
