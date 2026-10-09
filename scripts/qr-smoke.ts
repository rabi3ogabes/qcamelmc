// Run with: npx deno run -A scripts/qr-smoke.ts
// Proves the exact import the edge functions use renders a real PNG under Deno.
import { makeQrGenerator } from "../supabase/functions/_shared/qr.ts";

let usedLibrary = true;
const generate = makeQrGenerator({
  loadLib: () => import("npm:qrcode@1.5.4"),
  // if the library path fails we must notice, not silently use the web fallback
  fetch: () => {
    usedLibrary = false;
    return Promise.reject(new Error("fallback reached"));
  },
});

const png = await generate("QTR-ABC123DEF456-TKT01");
const signature = Array.from(png.slice(0, 8)).join(",");
console.log(JSON.stringify({ bytes: png.length, pngSignature: signature, usedLibrary }));
if (signature !== "137,80,78,71,13,10,26,10" || !usedLibrary) Deno.exit(1);
await Deno.writeFile(Deno.args[0] ?? "qr-smoke.png", png);
