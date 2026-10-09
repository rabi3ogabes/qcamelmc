// POST /backfill-qr-codes   (admins only)
// Creates the QR picture for tickets that do not have one yet. The ticket's
// scannable code is never changed — only qr_image_url is filled in. Works in
// batches so a single call stays fast; run it again to continue.

import { requireAdmin } from "../_shared/auth.ts";
import { HttpError, json, preflight, toErrorResponse } from "../_shared/http.ts";
import { renderTicketQr, type QrToolDeps } from "../_shared/qr-tools.ts";

const BATCH = 100;

export function backfillQrCodesHandler(deps: QrToolDeps) {
  return async (req: Request): Promise<Response> => {
    const early = preflight(req);
    if (early) return early;

    try {
      if (req.method !== "POST") throw new HttpError(405, "method_not_allowed", "Use POST");
      await requireAdmin(req, deps.auth);

      const holders = await deps.repo.listHoldersMissingQrImage(BATCH);
      let updated = 0;
      const errors: string[] = [];

      for (const holder of holders) {
        try {
          await renderTicketQr(deps, holder);
          updated++;
        } catch (error) {
          errors.push(`${holder.qr_code}: ${error instanceof Error ? error.message : "failed"}`);
        }
      }

      const more = holders.length === BATCH ? " — run it again to continue" : "";
      return json({
        success: true,
        updated,
        skipped: 0,
        ...(errors.length ? { errors } : {}),
        message: `Created ${updated} QR images${more}`,
      });
    } catch (error) {
      return toErrorResponse(error);
    }
  };
}
