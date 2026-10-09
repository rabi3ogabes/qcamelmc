/**
 * What a gate scanner read, as a ticket code. Newer tickets encode the code
 * itself; tickets printed by older versions may encode the URL of the QR
 * picture, whose file name IS the code (QTR-…-TKT01.png).
 */
export function normalizeScannedCode(scanned: string): string {
  const text = (scanned ?? "").trim();
  if (/^https?:\/\//i.test(text)) {
    return text.replace(/[?#].*$/, "").replace(/^.*\//, "").replace(/\.png$/i, "");
  }
  return text;
}
