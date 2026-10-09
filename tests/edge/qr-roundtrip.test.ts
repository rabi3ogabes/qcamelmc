import jsQR from "jsqr";
import { PNG } from "pngjs";
import { describe, expect, it } from "vitest";
import { makeQrGenerator } from "../../supabase/functions/_shared/qr.ts";

// The picture on a ticket must scan back to exactly the code the gate looks up.
const generate = makeQrGenerator({
  loadLib: () => import("qrcode"),
  fetch: () => Promise.reject(new Error("the web-service fallback must not be needed")),
});

const decode = (bytes: Uint8Array): string | null => {
  const png = PNG.sync.read(Buffer.from(bytes));
  return jsQR(new Uint8ClampedArray(png.data), png.width, png.height)?.data ?? null;
};

describe("ticket QR pictures", () => {
  it.each([
    "QTR-ABC123DEF456-TKT01",
    "POS-0123456789AB-TKT12",
    "QTR-ZZZZZZZZZZZZ-TKT30",
  ])("scan back to the exact ticket code %s", async (code) => {
    const png = await generate(code);
    expect(Array.from(png.slice(0, 4))).toEqual([137, 80, 78, 71]);
    expect(decode(png)).toBe(code);
  });
});
