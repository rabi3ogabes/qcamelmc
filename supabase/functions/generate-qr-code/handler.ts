// POST /generate-qr-code { text, filename }   (admins only)
// Renders one QR image into the public qr-codes bucket. The file name is
// restricted to a safe token so a caller can never write outside their own
// ticket's file or overwrite unrelated objects.

import { requireAdmin } from "../_shared/auth.ts";
import { HttpError, json, preflight, readJson, toErrorResponse } from "../_shared/http.ts";
import { qrObjectName } from "../_shared/qr.ts";
import type { QrToolDeps } from "../_shared/qr-tools.ts";


export function generateQrCodeHandler(deps: QrToolDeps) {
  return async (req: Request): Promise<Response> => {
    const early = preflight(req);
    if (early) return early;

    try {
      if (req.method !== "POST") throw new HttpError(405, "method_not_allowed", "Use POST");
      await requireAdmin(req, deps.auth);

      const body = (await readJson(req)) as { text?: unknown; filename?: unknown };
      const text = typeof body?.text === "string" ? body.text : "";
      const objectName = typeof body?.filename === "string" ? qrObjectName(body.filename) : null;
      if (!text || text.length > 500 || !objectName) {
        throw new HttpError(400, "invalid_request", "A QR text and a safe file name are required");
      }

      const url = await deps.storage.uploadPng(objectName, await deps.generateQr(text));
      return json({ url });
    } catch (error) {
      return toErrorResponse(error);
    }
  };
}
