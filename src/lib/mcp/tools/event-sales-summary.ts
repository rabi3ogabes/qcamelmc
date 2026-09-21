import { defineTool, ToolError } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser } from "../supabase";

/**
 * Sales + attendance snapshot for one event.
 * Revenue is counted per confirmed ticket holder multiplied by the ticket price,
 * which is how the dashboard reports it.
 */
export default defineTool({
  name: "event_sales_summary",
  title: "Event sales summary",
  description:
    "Ticket sales and gate attendance for one event: tickets sold per type, revenue, capacity left and how many holders have been scanned in.",
  inputSchema: {
    event_id: z
      .string()
      .uuid()
      .describe("Event id, as returned by list_events. Pass the current event when unsure."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ event_id }, ctx) => {
    if (!ctx.isAuthenticated()) throw new ToolError("Not authenticated");
    const supabase = supabaseForUser(ctx);

    const [eventRes, ticketsRes, ordersRes] = await Promise.all([
      supabase
        .from("events")
        .select("id, title, event_date")
        .eq("id", event_id)
        .maybeSingle(),
      supabase
        .from("tickets")
        .select("type, price, available_quantity")
        .eq("event_id", event_id),
      supabase
        .from("orders")
        .select("id, payment_method")
        .eq("event_id", event_id)
        .eq("payment_status", "confirmed"),
    ]);

    if (eventRes.error) throw new ToolError(eventRes.error.message);
    if (!eventRes.data) throw new ToolError("Event not found");
    if (ticketsRes.error) throw new ToolError(ticketsRes.error.message);
    if (ordersRes.error) throw new ToolError(ordersRes.error.message);

    const orders = ordersRes.data ?? [];
    const orderIds = orders.map((o) => String(o.id));
    const onlineOrderIds = new Set(
      orders.filter((o) => o.payment_method === "sadad").map((o) => String(o.id)),
    );

    type Holder = { order_id: string; ticket_type: string; is_present: boolean | null };
    const holders: Holder[] = [];
    for (let i = 0; i < orderIds.length; i += 200) {
      const { data, error } = await supabase
        .from("ticket_holders")
        .select("order_id, ticket_type, is_present")
        .in("order_id", orderIds.slice(i, i + 200));
      if (error) throw new ToolError(error.message);
      for (const h of data ?? []) {
        holders.push({
          order_id: String(h.order_id),
          ticket_type: String(h.ticket_type),
          is_present: h.is_present as boolean | null,
        });
      }
    }

    const priceByType = new Map<string, number>();
    const capacityByType = new Map<string, number>();
    for (const t of ticketsRes.data ?? []) {
      priceByType.set(String(t.type), Number(t.price) || 0);
      capacityByType.set(String(t.type), Number(t.available_quantity) || 0);
    }

    const byType: Record<string, { sold: number; scanned: number }> = {};
    for (const h of holders) {
      const key = h.ticket_type || "normal";
      byType[key] ??= { sold: 0, scanned: 0 };
      byType[key].sold += 1;
      if (h.is_present) byType[key].scanned += 1;
    }

    const ticket_types = Object.entries(byType).map(([type, v]) => {
      const price = priceByType.get(type) ?? 0;
      const capacity = capacityByType.get(type) ?? 0;
      return {
        type,
        sold: v.sold,
        scanned: v.scanned,
        price,
        revenue: v.sold * price,
        capacity,
        remaining: Math.max(0, capacity - v.sold),
      };
    });

    const summary = {
      event: {
        id: String(eventRes.data.id),
        title: String(eventRes.data.title),
        event_date: eventRes.data.event_date ? String(eventRes.data.event_date) : null,
      },
      orders_confirmed: orders.length,
      tickets_sold: holders.length,
      tickets_scanned: holders.filter((h) => h.is_present).length,
      tickets_sold_online: holders.filter((h) => onlineOrderIds.has(h.order_id)).length,
      tickets_sold_at_counter: holders.filter((h) => !onlineOrderIds.has(h.order_id)).length,
      revenue_qar: ticket_types.reduce((s, t) => s + t.revenue, 0),
      ticket_types,
    };

    return {
      content: [
        {
          type: "text",
          text: `${summary.event.title}: ${summary.tickets_sold} tickets sold, ${summary.tickets_scanned} scanned in, ${summary.revenue_qar} QAR.`,
        },
      ],
      structuredContent: { summary },
    };
  },
});
