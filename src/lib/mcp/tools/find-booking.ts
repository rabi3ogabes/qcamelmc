import { defineTool, ToolError } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser } from "../supabase";

/** Look a booking up by its reference and return the customer plus every ticket holder. */
export default defineTool({
  name: "find_booking",
  title: "Find a booking",
  description:
    "Look up one booking by its reference (for example POS-21-09-2026-UY956SR9R) and return the customer, payment status and every ticket holder with their check-in state.",
  inputSchema: {
    booking_reference: z.string().trim().min(4).describe("The booking reference to look up."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ booking_reference }, ctx) => {
    if (!ctx.isAuthenticated()) throw new ToolError("Not authenticated");
    const supabase = supabaseForUser(ctx);

    const { data: order, error } = await supabase
      .from("orders")
      .select(
        "id, booking_reference, quantity, total_amount, payment_method, payment_status, created_at, customers(name, phone, email), events(title, event_date)",
      )
      .eq("booking_reference", booking_reference.trim())
      .maybeSingle();
    if (error) throw new ToolError(error.message);
    if (!order) throw new ToolError("No booking found with that reference");

    const { data: holderRows, error: holdersError } = await supabase
      .from("ticket_holders")
      .select("name, phone, nationality, ticket_type, is_present, confirmed_at, confirmed_by_name")
      .eq("order_id", order.id);
    if (holdersError) throw new ToolError(holdersError.message);

    const customer = order.customers as { name?: string; phone?: string; email?: string } | null;
    const event = order.events as { title?: string; event_date?: string } | null;

    const booking = {
      booking_reference: String(order.booking_reference),
      payment_status: String(order.payment_status ?? ""),
      payment_method: String(order.payment_method ?? ""),
      total_amount: Number(order.total_amount) || 0,
      created_at: order.created_at ? String(order.created_at) : null,
      customer: {
        name: customer?.name ?? null,
        phone: customer?.phone ?? null,
        email: customer?.email ?? null,
      },
      event: {
        title: event?.title ?? null,
        event_date: event?.event_date ?? null,
      },
      holders: (holderRows ?? []).map((h) => ({
        name: String(h.name),
        phone: String(h.phone),
        nationality: String(h.nationality),
        ticket_type: String(h.ticket_type),
        checked_in: Boolean(h.is_present),
        checked_in_at: h.confirmed_at ? String(h.confirmed_at) : null,
        checked_in_by: h.confirmed_by_name ? String(h.confirmed_by_name) : null,
      })),
    };

    return {
      content: [
        {
          type: "text",
          text: `${booking.booking_reference} — ${booking.customer.name ?? "?"} — ${booking.holders.length} ticket(s), payment ${booking.payment_status}.`,
        },
      ],
      structuredContent: { booking },
    };
  },
});
