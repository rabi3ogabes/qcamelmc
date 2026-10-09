#!/usr/bin/env node
// Type-checks every edge function entry point with Deno (the real runtime,
// including the Supabase client types and the npm:qrcode import).
//   npm run check:deno
import { spawnSync } from "node:child_process";
import { readdirSync } from "node:fs";
import { join } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const FUNCTIONS = join(ROOT, "supabase", "functions");

const entries = readdirSync(FUNCTIONS, { withFileTypes: true })
  .filter((d) => d.isDirectory() && d.name !== "_shared")
  .map((d) => join("supabase", "functions", d.name, "index.ts"));

const result = spawnSync("npx", ["--no", "deno", "check", "--no-lock", ...entries], {
  cwd: ROOT,
  stdio: "inherit",
  shell: process.platform === "win32",
});
process.exit(result.status ?? 1);
