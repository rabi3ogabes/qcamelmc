// POST /ticket-checkin { booking_reference: <scanned ticket code> }   (admins only)
//
// Gate scanning. The whole decision (exists? paid? already used?) is one
// atomic database call, so two scanners can never both admit the same ticket,
// and the admin recorded on the ticket is the verified caller — never a value
// taken from the request body.

import { requireAdmin, type AuthDeps } from "./_shared/auth.ts";
import { HttpError, json, preflight, readJson, toErrorResponse } from "./_shared/http.ts";
import type { Repo } from "./_shared/repo.ts";

export interface CheckinDeps {
  repo: Repo;
  auth: AuthDeps;
}

type Row = Record<string, unknown>;

/** Same shape the scanner screen has always consumed. */
function ticketInfo(t: Row) {
  return {
    booking_reference: t.booking_reference,
    customer_name: t.customer_name,
    event_title: t.event_title,
    ticket_type: t.ticket_type,
    ticket_holder_name: t.holder_name,
    ticket_holder_phone: t.holder_phone,
    ticket_holder_nationality: t.holder_nationality,
    ticket_holder_id_number: t.holder_id_number,
    quantity: 1,
    payment_status: t.payment_status,
    is_present: t.is_present,
    confirmed_at: t.confirmed_at,
  };
}

export function ticketCheckinHandler(deps: CheckinDeps) {
  return async (req: Request): Promise<Response> => {
    const early = preflight(req);
    if (early) return early;

    try {
      if (req.method !== "POST") throw new HttpError(405, "method_not_allowed", "Use POST");
      const adminId = await requireAdmin(req, deps.auth);

      const body = (await readJson(req)) as { booking_reference?: unknown };
      const code = typeof body?.booking_reference === "string" ? body.booking_reference.trim() : "";
      if (!code || code.length > 300) {
        throw new HttpError(400, "missing_code", "Booking reference is required", { message: "رقم الحجز مطلوب" });
      }

      const outcome = await deps.repo.checkInTicket(code, adminId);
      const ticket = (outcome.ticket ?? {}) as Row;

      switch (outcome.result) {
        case "checked_in":
          return json({
            success: true,
            message: `✅ تم التحقق من تذكرة ${String(ticket.holder_name ?? "")}`.trim(),
            ticket_info: ticketInfo(ticket),
          });
        case "already_present":
          return json({
            success: false,
            error: "Already checked in",
            message: "تم استخدام التذكرة مسبقاً",
            ticket_info: ticketInfo(ticket),
          });
        case "payment_not_confirmed":
          return json({
            success: false,
            error: "Payment not confirmed",
            message: "⚠️ الدفع غير مؤكد - لا يمكن تسجيل الدخول",
            ticket_info: ticketInfo(ticket),
          });
        default:
          return json({ success: false, error: "Ticket not found", message: "تذكرة غير موجودة" }, 404);
      }
    } catch (error) {
      return toErrorResponse(error);
    }
  };
}
