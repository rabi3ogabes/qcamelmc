import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Every sidebar link must lead to a page that exists in the router.
const app = readFileSync("src/App.tsx", "utf8");
const dashboard = readFileSync("src/pages/AdminDashboard.tsx", "utf8");
const hub = readFileSync("src/pages/StaffHub.tsx", "utf8");

const topRoutes = [...app.matchAll(/<Route path="(\/[^"]*)"/g)].map((m) => m[1]);
const dashChildren = [...app.matchAll(/<Route path="([a-z-]+)" element/g)].map((m) => `/admin/dashboard/${m[1]}`);
const routes = new Set([...topRoutes, ...dashChildren]);

describe("navigation", () => {
  const sidebar = [...dashboard.matchAll(/to: "([^"]+)"/g)].map((m) => m[1]);
  const staff = [...hub.matchAll(/to: "([^"]+)"/g)].map((m) => m[1]);

  it("finds the sidebar links", () => {
    expect(sidebar.length).toBeGreaterThan(10);
  });
  it.each([...sidebar, ...staff])("%s is a real page", (link) => {
    expect(routes.has(link)).toBe(true);
  });
});
