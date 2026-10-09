import { describe, expect, it } from "vitest";
import { requireAdmin, optionalAdmin, bearer, type AuthDeps } from "../../supabase/functions/_shared/auth.ts";
import {
  HttpError,
  json,
  readJson,
  toErrorResponse,
} from "../../supabase/functions/_shared/http.ts";
import { mapOrderError } from "../../supabase/functions/_shared/order-errors.ts";

const req = (headers: Record<string, string> = {}, body?: string, method = "POST") =>
  new Request("https://x.supabase.co/functions/v1/f", { method, headers, body });

describe("json / readJson / toErrorResponse", () => {
  it("returns JSON with CORS headers", async () => {
    const res = json({ a: 1 }, 201);
    expect(res.status).toBe(201);
    expect(res.headers.get("content-type")).toContain("application/json");
    expect(res.headers.get("access-control-allow-origin")).toBe("*");
    expect(await res.json()).toEqual({ a: 1 });
  });

  it("parses a JSON body", async () => {
    expect(await readJson(req({}, '{"x":1}'))).toEqual({ x: 1 });
  });

  it("rejects invalid JSON with a 400", async () => {
    await expect(readJson(req({}, "{nope"))).rejects.toMatchObject({ status: 400, code: "invalid_json" });
  });

  it("rejects oversized bodies with a 413", async () => {
    await expect(readJson(req({}, JSON.stringify({ x: "y".repeat(2000) })), 500)).rejects.toMatchObject({
      status: 413,
    });
  });

  it("turns an HttpError into its status and code", async () => {
    const res = toErrorResponse(new HttpError(409, "insufficient_stock", "Sold out", { ticket_type: "vip" }));
    expect(res.status).toBe(409);
    expect(await res.json()).toEqual({
      success: false,
      code: "insufficient_stock",
      error: "Sold out",
      ticket_type: "vip",
    });
  });

  it("never leaks the message of an unexpected error", async () => {
    const res = toErrorResponse(new Error("password authentication failed for user postgres"));
    expect(res.status).toBe(500);
    const body = await res.json();
    expect(body.code).toBe("internal_error");
    expect(JSON.stringify(body)).not.toContain("password");
  });
});

describe("auth", () => {
  const deps = (over: Partial<AuthDeps> = {}): AuthDeps => ({
    getUserId: async (jwt) => (jwt === "admin-jwt" ? "admin-1" : jwt === "member-jwt" ? "member-1" : null),
    isAdmin: async (id) => id === "admin-1",
    ...over,
  });

  it("extracts a bearer token", () => {
    expect(bearer(req({ authorization: "Bearer abc.def" }))).toBe("abc.def");
    expect(bearer(req({ authorization: "bearer abc" }))).toBe("abc");
    expect(bearer(req({}))).toBeNull();
    expect(bearer(req({ authorization: "Basic xyz" }))).toBeNull();
  });

  it("accepts an admin session", async () => {
    expect(await requireAdmin(req({ authorization: "Bearer admin-jwt" }), deps())).toBe("admin-1");
  });

  it("rejects a missing or non-user token (the public anon key) with 401", async () => {
    await expect(requireAdmin(req({}), deps())).rejects.toMatchObject({ status: 401 });
    await expect(requireAdmin(req({ authorization: "Bearer anon-key" }), deps())).rejects.toMatchObject({ status: 401 });
  });

  it("rejects a signed-in user who is not an admin with 403", async () => {
    await expect(requireAdmin(req({ authorization: "Bearer member-jwt" }), deps())).rejects.toMatchObject({ status: 403 });
  });

  it("optionalAdmin returns null instead of throwing for visitors and members", async () => {
    expect(await optionalAdmin(req({}), deps())).toBeNull();
    expect(await optionalAdmin(req({ authorization: "Bearer member-jwt" }), deps())).toBeNull();
    expect(await optionalAdmin(req({ authorization: "Bearer admin-jwt" }), deps())).toBe("admin-1");
  });

  it("treats an auth backend failure as unauthenticated, not as admin", async () => {
    const broken = deps({
      getUserId: async () => {
        throw new Error("auth down");
      },
    });
    await expect(requireAdmin(req({ authorization: "Bearer admin-jwt" }), broken)).rejects.toMatchObject({ status: 401 });
  });
});

describe("mapOrderError", () => {
  it.each([
    ["insufficient_stock:vip", 409, "insufficient_stock"],
    ["quantity_limit_exceeded", 422, "quantity_limit_exceeded"],
    ["below_minimum_amount", 422, "below_minimum_amount"],
    ["event_not_available", 409, "event_not_available"],
    ["invalid_tickets", 422, "invalid_tickets"],
    ["holders_mismatch", 422, "holders_mismatch"],
    ["invalid_request", 400, "invalid_request"],
    ["forbidden", 403, "forbidden"],
  ])("maps %s", (message, status, code) => {
    const e = mapOrderError(message);
    expect(e).toBeInstanceOf(HttpError);
    expect(e).toMatchObject({ status, code });
  });

  it("includes the ticket type for stock errors", () => {
    expect(mapOrderError("insufficient_stock:parking")?.extra).toEqual({ ticket_type: "parking" });
  });

  it("returns null for anything it does not recognise", () => {
    expect(mapOrderError('relation "orders" does not exist')).toBeNull();
    expect(mapOrderError("")).toBeNull();
  });
});
