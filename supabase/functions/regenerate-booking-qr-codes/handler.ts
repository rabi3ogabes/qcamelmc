// POST /regenerate-booking-qr-codes { booking_reference }   (admins only)
// Re-renders the QR pictures of one booking (e.g. an image was deleted or
// looks wrong). Ticket codes themselves are immutable: a regenerated picture
// always encodes the same code the gate scanner already recognises.

import { requireAdmin } from "./_shared/auth.ts";
import { HttpError, json, preflight, readJson, toErrorResponse } from "./_shared/http.ts";
import { renderTicketQr, type QrToolDeps } from "./_shared/qr-tools.ts";

const SAFE_REF = /^[A-Za-z0-9][A-Za-z0-9_-]{0,59}$/;

export function regenerateBookingQrHandler(deps: QrToolDeps) {
  return async (req: Request): Promise<Response> => {
    const early = preflight(req);
    if (early) return early;

    try {
      if (req.method !== "POST") throw new HttpError(405, "method_not_allowed", "Use POST");
      await requireAdmin(req, deps.auth);

      const body = (await readJson(req)) as { booking_reference?: unknown };
      const ref = typeof body?.booking_reference === "string" ? body.booking_reference.trim() : "";
      if (!SAFE_REF.test(ref)) throw new HttpError(400, "invalid_reference", "Missing or invalid booking_reference");

      const holders = await deps.repo.listBookingHolders(ref);
      if (!holders) throw new HttpError(404, "order_not_found", "Booking reference not found");

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

      return json({
        success: true,
        updated,
        total: holders.length,
        ...(errors.length ? { errors } : {}),
        message: `Regenerated ${updated} QR images for booking ${ref}`,
      });
    } catch (error) {
      return toErrorResponse(error);
    }
  };
}
