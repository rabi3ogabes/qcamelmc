import { auth, defineMcp } from "@lovable.dev/mcp-js";
import listEventsTool from "./tools/list-events";
import eventSalesSummaryTool from "./tools/event-sales-summary";
import findBookingTool from "./tools/find-booking";
import searchCustomersTool from "./tools/search-customers";

// The OAuth issuer must be the direct Supabase host, built from the project ref
// (Vite inlines this literal at build time, so the entry stays import-safe).
const projectRef = import.meta.env.VITE_SUPABASE_PROJECT_ID ?? "project-ref-unset";

export default defineMcp({
  name: "qcamelmc",
  title: "qcamelmc",
  version: "0.1.0",
  instructions:
    "Read-only tools for the qcamelmc ticketing system. Use `list_events` to find an event id, `event_sales_summary` for sales, revenue and gate attendance of that event, `find_booking` to look up a booking by its reference, and `search_customers` to find a customer by name, phone or email. All data is scoped to the signed-in admin account.",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  tools: [listEventsTool, eventSalesSummaryTool, findBookingTool, searchCustomersTool],
});
