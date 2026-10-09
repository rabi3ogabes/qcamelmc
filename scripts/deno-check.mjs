#!/usr/bin/env node
// Type-checks every edge function entry point with Deno (the real runtime,
// including the Supabase client types, npm: imports and JSX e-mail templates).
// Each function is checked on its own, with its own deno.json when it has one,
// so a failure names the function instead of hiding the others.
//   npm run check:deno
//   npm run check:deno -- create-order staff-auth     # only these
import { spawnSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { join } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const FUNCTIONS = join(ROOT, "supabase", "functions");
const only = new Set(process.argv.slice(2));
// Machine-generated bundles that a build plugin rewrites ("do not edit"): not ours to type-check.
const GENERATED = new Set(["mcp"]);

const names = readdirSync(FUNCTIONS, { withFileTypes: true })
  .filter((d) => d.isDirectory() && d.name !== "_shared" && !GENERATED.has(d.name) && existsSync(join(FUNCTIONS, d.name, "index.ts")))
  .map((d) => d.name)
  .filter((name) => only.size === 0 || only.has(name));

const failures = [];
for (const name of names) {
  const dir = join("supabase", "functions", name);
  const config = existsSync(join(ROOT, dir, "deno.json")) ? ["--config", join(dir, "deno.json")] : [];
  const started = Date.now();
  const result = spawnSync(
    "npx",
    ["--no", "deno", "check", "--no-lock", "--node-modules-dir=none", ...config, join(dir, "index.ts")],
    {
      cwd: ROOT,
      encoding: "utf8",
      shell: process.platform === "win32",
      // Edge functions are their own world: do not let Deno read the website's package.json or write
      // into its node_modules (npm: imports resolve from Deno's own cache instead).
      env: { ...process.env, DENO_NO_PACKAGE_JSON: "1" },
    },
  );
  const seconds = ((Date.now() - started) / 1000).toFixed(1);
  if (result.status === 0) {
    console.log(`✓ ${name}  (${seconds}s)`);
  } else {
    failures.push(name);
    console.log(`✗ ${name}  (${seconds}s)`);
    const output = `${result.stdout ?? ""}${result.stderr ?? ""}`
      .split("\n")
      .filter((line) => !/^\s*(Download|Check)\b/.test(line.replace(/\u001b\[[0-9;]*m/g, "")))
      .join("\n")
      .trim();
    console.log(output.split("\n").map((line) => `    ${line}`).join("\n"));
  }
}

console.log(failures.length ? `\n${failures.length} of ${names.length} functions failed the type-check` : `\nAll ${names.length} functions type-check`);
process.exit(failures.length ? 1 : 0);
