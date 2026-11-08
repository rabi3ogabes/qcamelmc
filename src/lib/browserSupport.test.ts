import { afterEach, describe, expect, it, vi } from "vitest";
import { secureUuid, toggleBrowserFullscreen } from "./browserSupport";

afterEach(() => vi.unstubAllGlobals());

describe("older browser support", () => {
  it("uses secure random bytes when randomUUID is unavailable", () => {
    const getRandomValues = vi.fn((bytes: Uint8Array) => { bytes.fill(255); return bytes; });
    vi.stubGlobal("crypto", { getRandomValues });
    expect(secureUuid()).toBe("ffffffff-ffff-4fff-bfff-ffffffffffff");
    expect(getRandomValues).toHaveBeenCalledTimes(1);
  });
  it("enters and exits fullscreen through Safari-prefixed methods", async () => {
    const enter = vi.fn();
    const exit = vi.fn();
    const doc = { documentElement: { webkitRequestFullscreen: enter }, webkitExitFullscreen: exit, webkitFullscreenElement: null };
    await toggleBrowserFullscreen(doc as unknown as Document);
    expect(enter).toHaveBeenCalledTimes(1);
    doc.webkitFullscreenElement = {} as never;
    await toggleBrowserFullscreen(doc as unknown as Document);
    expect(exit).toHaveBeenCalledTimes(1);
  });
  it("rejects unsupported fullscreen without a synchronous exception", async () => {
    await expect(toggleBrowserFullscreen({ documentElement: {} } as Document)).rejects.toThrow("Fullscreen unavailable");
  });
});