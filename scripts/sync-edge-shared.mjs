#!/usr/bin/env node
// Edge functions deploy as self-contained bundles, so shared code is vendored:
// supabase/functions/_shared/*.ts is the single source of truth and this script
// copies exactly the modules each function needs into <function>/_shared/.
//
//   npm run sync:functions          # write the copies
//   npm run sync:functions -- --check   # exit 1 if any copy is stale (CI)

import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const FUNCTIONS = join(ROOT, "supabase", "functions");
const SHARED = join(FUNCTIONS, "_shared");
const check = process.argv.includes("--check");

const HEADER = (name) =>
  `// AUTO-GENERATED COPY of supabase/functions/_shared/${name}.ts — do not edit here.\n` +
  `// Edit the original, then run "npm run sync:functions". Each function ships self-contained.\n\n`;

const importsOf = (source, pattern) => [...source.matchAll(pattern)].map((m) => m[1]);
const FROM_VENDORED = /from\s+["']\.\/_shared\/([\w-]+)\.ts["']/g;
const FROM_SIBLING = /from\s+["']\.\/([\w-]+)\.ts["']/g;

/** Every shared module a function needs, following imports between shared modules. */
function closure(entryFiles) {
  const needed = new Set();
  const queue = [];
  for (const file of entryFiles) {
    if (existsSync(file)) queue.push(...importsOf(readFileSync(file, "utf8"), FROM_VENDORED));
  }
  while (queue.length) {
    const name = queue.pop();
    if (needed.has(name)) continue;
    const source = join(SHARED, `${name}.ts`);
    if (!existsSync(source)) throw new Error(`_shared/${name}.ts is imported but does not exist`);
    needed.add(name);
    queue.push(...importsOf(readFileSync(source, "utf8"), FROM_SIBLING));
  }
  return [...needed].sort();
}

let stale = 0;
const functions = readdirSync(FUNCTIONS, { withFileTypes: true })
  .filter((d) => d.isDirectory() && d.name !== "_shared")
  .map((d) => d.name);

for (const fn of functions) {
  const dir = join(FUNCTIONS, fn);
  const names = closure([join(dir, "index.ts"), join(dir, "handler.ts")]);
  const target = join(dir, "_shared");

  if (names.length === 0) {
    if (existsSync(target)) {
      if (check) stale++, console.error(`stale: ${fn}/_shared should not exist`);
      else rmSync(target, { recursive: true });
    }
    continue;
  }

  if (!check) mkdirSync(target, { recursive: true });
  for (const name of names) {
    const expected = HEADER(name) + readFileSync(join(SHARED, `${name}.ts`), "utf8");
    const file = join(target, `${name}.ts`);
    const actual = existsSync(file) ? readFileSync(file, "utf8") : null;
    if (actual !== expected) {
      if (check) stale++, console.error(`stale: ${fn}/_shared/${name}.ts`);
      else writeFileSync(file, expected);
    }
  }
  if (existsSync(target)) {
    for (const existing of readdirSync(target)) {
      if (!names.includes(existing.replace(/\.ts$/, ""))) {
        if (check) stale++, console.error(`stale: ${fn}/_shared/${existing} is no longer needed`);
        else rmSync(join(target, existing));
      }
    }
  }
}

if (check) {
  if (stale) {
    console.error(`\n${stale} vendored file(s) out of date — run: npm run sync:functions`);
    process.exit(1);
  }
  console.log("Edge function shared code is in sync");
} else {
  console.log(`Synced shared code into ${functions.length} function folders`);
}
