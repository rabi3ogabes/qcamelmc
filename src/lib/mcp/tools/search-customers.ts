import { defineTool, ToolError } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser } from "../supabase";

/** Search customers by name, phone or email and list their bookings. */
export default defineTool({
  name: "search_customers",
  title: "Search customers",
  description:
    "Search customers by part of their name, phone number or email address, and see how many bookings each one has.",
  inputSchema: {
    query: z.string().trim().min(2).describe("Part of a name, phone number or email."),
    limit: z.number().int().min(1).max(25).describe("How many customers to return."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ query, limit }, ctx) => {
    if (!ctx.isAuthenticated()) throw new ToolError("Not authenticated");
    const supabase = supabaseForUser(ctx);

    const term = query.replace(/[%,]/g, " ").trim();
    const { data, error } = await supabase
      .from("customers")
      .select("id, name, phone, email, nationality, created_at")
      .or(`name.ilike.%${term}%,phone.ilike.%${term}%,email.ilike.%${term}%`)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) throw new ToolError(error.message);

    const rows = data ?? [];
    const customers = [] as Array<{
      id: string;
      name: string;
      phone: string;
      email: string;
      nationality: string | null;
      bookings: number;
    }>;

    for (const c of rows) {
      const { count } = await supabase
        .from("orders")
        .select("id", { count: "exact", head: true })
        .eq("customer_id", c.id);
      customers.push({
        id: String(c.id),
        name: String(c.name),
        phone: String(c.phone),
        email: String(c.email),
        nationality: c.nationality ? String(c.nationality) : null,
        bookings: count ?? 0,
      });
    }

    return {
      content: [
        {
          type: "text",
          text: customers.length
            ? customers.map((c) => `${c.name} — ${c.phone} (${c.bookings} bookings)`).join("\n")
            : "No matching customers.",
        },
      ],
      structuredContent: { customers },
    };
  },
});
