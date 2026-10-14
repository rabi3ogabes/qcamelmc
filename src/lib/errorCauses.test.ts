import { describe, expect, it } from "vitest";
import { classifyError, isNoiseError } from "./errorCauses";

describe("classifyError", () => {
  it("payment records are grouped under payment", () => {
    expect(classifyError({ source: "payment", message: "TypeError x" })).toBe("payment");
  });
  it("email failures are grouped under email", () => {
    expect(classifyError({ source: "email", message: "bounced" })).toBe("email");
  });
  it("stale page chunks are page loading, not network", () => {
    expect(classifyError({ message: "Failed to fetch dynamically imported module: /assets/x.js" })).toBe("page_load");
  });
  it("fetch failures are network", () => {
    expect(classifyError({ message: "TypeError: Failed to fetch" })).toBe("network");
  });
  it("RLS denials are permission", () => {
    expect(classifyError({ message: "new row violates row-level security policy" })).toBe("permission");
  });
  it("duplicate keys are data", () => {
    expect(classifyError({ message: "duplicate key value 23505" })).toBe("data");
  });
  it("crashes are code", () => {
    expect(classifyError({ message: "Cannot read properties of undefined" })).toBe("code");
  });
});

describe("isNoiseError", () => {
  it("ignores browser noise", () => {
    expect(isNoiseError("ResizeObserver loop limit exceeded")).toBe(true);
    expect(isNoiseError("Script error.")).toBe(true);
  });
  it("keeps real errors", () => {
    expect(isNoiseError("x is not a function")).toBe(false);
  });
});
