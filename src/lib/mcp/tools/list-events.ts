import { defineTool, ToolError } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser } from "../supabase";

export default defineTool({
  name: "list_events",
  title: "List events",
  description:
    "List the ticketing events (title, date, location, capacity status), newest first.",
  inputSchema: {
    include_archived: z
      .boolean()
      .describe("Include archived (past season) events as well."),
    limit: z.number().int().min(1).max(50).describe("How many events to return."),
  },
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async ({ include_archived, limit }, ctx) => {
    if (!ctx.isAuthenticated()) throw new ToolError("Not authenticated");
    const supabase = supabaseForUser(ctx);

    let query = supabase
      .from("events")
      .select("id, title, event_date, end_date, location, is_active, is_archived")
      .order("event_date", { ascending: false })
      .limit(limit);
    if (!include_archived) query = query.eq("is_archived", false);

    const { data, error } = await query;
    if (error) throw new ToolError(error.message);

    const events = (data ?? []).map((e) => ({
      id: String(e.id),
      title: String(e.title),
      event_date: e.event_date ? String(e.event_date) : null,
      end_date: e.end_date ? String(e.end_date) : null,
      location: e.location ? String(e.location) : null,
      is_active: Boolean(e.is_active),
      is_archived: Boolean(e.is_archived),
    }));

    return {
      content: [
        {
          type: "text",
          text: events.length
            ? events
                .map((e) => `${e.title} — ${e.event_date ?? "?"} (${e.id})`)
                .join("\n")
            : "No events found.",
        },
      ],
      structuredContent: { events },
    };
  },
});
