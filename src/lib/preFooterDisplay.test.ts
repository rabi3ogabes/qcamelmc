import { describe, expect, it } from "vitest";
import { preFooterDisplay } from "./preFooterDisplay";

describe("pre-footer display settings", () => {
  it("keeps the admin's horizontal or vertical choice", () => {
    expect(preFooterDisplay("repeat-x", 100).repeat).toBe("repeat-x");
    expect(preFooterDisplay("repeat-y", 100).repeat).toBe("repeat-y");
  });
  it("converts the saved opacity percentage including fully transparent", () => {
    expect(preFooterDisplay("repeat-x", 35).opacity).toBe(0.35);
    expect(preFooterDisplay("repeat-x", 0).opacity).toBe(0);
    expect(preFooterDisplay("repeat-x", 100).opacity).toBe(1);
  });
  it("uses existing presentation defaults for old cached settings", () => {
    expect(preFooterDisplay(undefined, undefined)).toEqual({ repeat: "repeat-x", opacity: 1 });
  });
});