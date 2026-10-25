import { describe, expect, it } from "vitest";
import { heroImageDisplay } from "./heroImageDisplay";

describe("hero image settings", () => {
  it("preserves the admin's top and bottom alignment", () => {
    expect(heroImageDisplay("top", 500).position).toBe("top");
    expect(heroImageDisplay("bottom", 500).position).toBe("bottom");
  });
  it("preserves a saved height", () => {
    expect(heroImageDisplay("center", 520).height).toBe(520);
  });
  it("keeps existing defaults for old cached settings", () => {
    expect(heroImageDisplay()).toEqual({ position: "center", height: 600 });
  });
  it("normalizes invalid dimensions", () => {
    expect(heroImageDisplay("invalid", NaN)).toEqual({ position: "center", height: 600 });
    expect(heroImageDisplay("top", 100).height).toBe(300);
    expect(heroImageDisplay("bottom", 1000).height).toBe(800);
  });
});