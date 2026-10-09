// POST /create-order
//
// The only way an order comes into existence. The browser says WHICH tickets
// and WHO will use them; price, stock, status and the payment request are all
// decided here and in the database. Prices/totals/statuses sent by a client
// are never read.

import { optionalAdmin, requireAdmin, type AuthDeps } from "./_shared/auth.ts";
import { HttpError, json, preflight, readJson, toErrorResponse } from "./_shared/http.ts";
import { buildOrderCreatedPayload, postWebhook } from "./_shared/notify.ts";
import { renderTicketQr } from "./_shared/qr-tools.ts";
import type { QrStorage, Repo } from "./_shared/repo.ts";
import { buildCheckoutRequest, toSadadMobile } from "./_shared/sadad-core.ts";
import { callbackUrlFor, fallbackEmail, isSadadConfigured, safeOrigin } from "./_shared/settings.ts";
import { parseCreateOrderInput } from "./_shared/validation.ts";

export interface CreateOrderDeps {
  repo: Repo;
  auth: AuthDeps;
  storage: QrStorage;
  generateQr: (text: string) => Promise<Uint8Array>;
  fetch: typeof fetch;
  supabaseUrl: string;
  /** Run work after the response is sent (EdgeRuntime.waitUntil on Supabase). */
  waitUntil: (work: Promise<unknown>) => void;
  now?: () => Date;
}

/** A customer may hold at most this many unpaid orders at once. */
const MAX_OPEN_ORDERS_PER_PHONE = 4;

const TICKET_LABELS: Record<string, string> = {
  vip: "تذكرة VIP",
  normal: "تذكرة دخول عامة",
  parking: "تصريح مواقف",
};

const holderCountryCode = (phone: string, fallback: string) =>
  /^\s*(\+\d{1,4})\s/.exec(phone)?.[1] ?? fallback;

export function createOrderHandler(deps: CreateOrderDeps) {
  return async (req: Request): Promise<Response> => {
    const early = preflight(req);
    if (early) return early;

    try {
      if (req.method !== "POST") throw new HttpError(405, "method_not_allowed", "Use POST");

      const body = await readJson(req);
      const parsed = parseCreateOrderInput(body);
      if (!parsed.ok) {
        throw new HttpError(400, "validation_failed", "The order details are invalid", { errors: parsed.errors });
      }
      const input = parsed.value;

      // Point of sale: only a signed-in administrator, and only cash.
      const wantsPos = (body as { source?: unknown }).source === "pos";
      let actor: string | null = null;
      if (wantsPos) {
        actor = await requireAdmin(req, deps.auth);
        if (input.payment_method !== "cash_pos") {
          throw new HttpError(400, "validation_failed", "Point-of-sale orders are cash orders");
        }
      } else {
        // Browsers may not be an admin; this only decides nothing but keeps the call explicit.
        await optionalAdmin(req, deps.auth);
      }

      const settings = await deps.repo.getPrivateSettings();
      if (input.payment_method === "sadad" && !isSadadConfigured(settings)) {
        throw new HttpError(503, "payment_unavailable", "Online payment is not available right now");
      }

      if (!wantsPos) {
        const open = await deps.repo.countOpenOrders(input.customer.phone);
        if (open >= MAX_OPEN_ORDERS_PER_PHONE) {
          throw new HttpError(429, "too_many_pending_orders", "Please complete or cancel your existing bookings first");
        }
      }

      const created = await deps.repo.createOrder({
        customer: input.customer as unknown as Record<string, unknown>,
        items: input.items as unknown as Record<string, unknown>[],
        holders: input.holders as unknown as Record<string, unknown>[],
        paymentMethod: input.payment_method,
        source: wantsPos ? "pos" : "web",
        actor,
        returnOrigin: safeOrigin(req.headers.get("origin")),
      });

      // QR pictures are a convenience (the ticket scans by its code), so a failure never fails the order.
      const imageUrls = new Map<string, string>();
      await Promise.all(
        created.holders.map(async (holder) => {
          try {
            imageUrls.set(holder.id, await renderTicketQr(deps, holder));
          } catch (error) {
            console.error("QR image failed for", holder.qr_code, error instanceof Error ? error.message : error);
          }
        }),
      );

      // Cash-at-venue bookings are complete now: tell the automation (WhatsApp etc.) in the background.
      if (!wantsPos && input.payment_method === "cash_pos" && settings.webhookUrl) {
        const payload = buildOrderCreatedPayload({
          customer: input.customer as unknown as Record<string, unknown>,
          order: {
            id: created.order_id,
            booking_reference: created.booking_reference,
            total_amount: created.total_amount,
            payment_method: created.payment_method,
            payment_status: created.payment_status,
            event_id: created.event_id,
          },
          holders: created.holders.map((holder, index) => ({
            order_id: created.order_id,
            name: input.holders[index]?.name ?? holder.name,
            phone: input.holders[index]?.phone ?? "",
            country_code: holderCountryCode(input.holders[index]?.phone ?? "", input.customer.country_code),
            nationality: input.holders[index]?.nationality ?? "",
            ticket_type: holder.ticket_type,
            qr_code: holder.qr_code,
            qr_image_url: imageUrls.get(holder.id) ?? null,
            id_number: input.holders[index]?.id_number ?? "",
          })),
          adminPhone: settings.adminPhone,
          now: deps.now?.(),
        });
        deps.waitUntil(postWebhook(deps.fetch, settings.webhookUrl, payload));
      }

      let payment: Awaited<ReturnType<typeof buildCheckoutRequest>> | undefined;
      if (input.payment_method === "sadad") {
        try {
          payment = await buildCheckoutRequest({
            merchantId: settings.merchantId as string,
            secret: settings.secret as string,
            orderId: created.booking_reference,
            amount: created.total_amount,
            website: settings.websiteDomain as string,
            callbackUrl: callbackUrlFor(deps.supabaseUrl),
            mobile: toSadadMobile(input.customer.phone, input.customer.country_code),
            email: input.customer.email || fallbackEmail(settings.websiteDomain),
            now: deps.now?.(),
            items: created.items.map((item) => ({
              name: TICKET_LABELS[item.type] ?? item.type,
              price: item.price,
              quantity: item.quantity,
            })),
          });
        } catch (error) {
          // Do not leave seats locked for an order the customer can never pay.
          await deps.repo.failOrderPayment(created.booking_reference, "checkout_request_failed").catch(() => undefined);
          console.error("could not build the Sadad request:", error instanceof Error ? error.message : error);
          throw new HttpError(502, "payment_unavailable", "Online payment is not available right now");
        }
      }

      return json(
        {
          success: true,
          order: {
            id: created.order_id,
            booking_reference: created.booking_reference,
            total_amount: created.total_amount,
            payment_method: created.payment_method,
            payment_status: created.payment_status,
            payment_expires_at: created.payment_expires_at,
          },
          ...(payment ? { payment } : {}),
        },
        200,
        { "Cache-Control": "no-store" },
      );
    } catch (error) {
      return toErrorResponse(error);
    }
  };
}
