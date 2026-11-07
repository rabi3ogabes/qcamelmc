import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("@/lib/staffHandoff", () => ({ buildStaffUrl: vi.fn() }));

import { buildStaffUrl } from "@/lib/staffHandoff";
import { openStaffPage } from "./openStaffPage";

afterEach(() => vi.unstubAllGlobals());

describe("staff page navigation", () => {
  it("opens synchronously, detaches the opener, and navigates after the token arrives", async () => {
    let resolveUrl: (url: string) => void = () => {};
    vi.mocked(buildStaffUrl).mockReturnValueOnce(new Promise((resolve) => { resolveUrl = resolve; }));
    const tab = { opener: {} as unknown, closed: false, location: { replace: vi.fn() } };
    const open = vi.fn(() => tab);
    const assign = vi.fn();
    vi.stubGlobal("window", { open, location: { assign } });

    const pending = openStaffPage("/admin/pos");
    expect(open).toHaveBeenCalledTimes(1);
    expect(open).toHaveBeenCalledWith("about:blank", "_blank");
    expect(tab.opener).toBeNull();
    expect(tab.location.replace).not.toHaveBeenCalled();
    resolveUrl("/admin/pos#sk=opaque-token");
    await pending;
    expect(tab.location.replace).toHaveBeenCalledWith("/admin/pos#sk=opaque-token");
    expect(assign).not.toHaveBeenCalled();
  });

  it("opens in the current tab when popups are blocked, without a second popup attempt", async () => {
    vi.mocked(buildStaffUrl).mockResolvedValueOnce("/admin/qr-scanner#sk=opaque-token");
    const open = vi.fn(() => null);
    const assign = vi.fn();
    vi.stubGlobal("window", { open, location: { assign } });
    await openStaffPage("/admin/qr-scanner");
    expect(open).toHaveBeenCalledTimes(1);
    expect(assign).toHaveBeenCalledWith("/admin/qr-scanner#sk=opaque-token");
  });

  it("uses the current tab if the reserved tab was closed", async () => {
    vi.mocked(buildStaffUrl).mockResolvedValueOnce("/staff/attendance");
    const replace = vi.fn();
    const assign = vi.fn();
    vi.stubGlobal("window", { open: vi.fn(() => ({ opener: null, closed: true, location: { replace } })), location: { assign } });
    await openStaffPage("/staff/attendance");
    expect(assign).toHaveBeenCalledWith("/staff/attendance");
    expect(replace).not.toHaveBeenCalled();
  });
});