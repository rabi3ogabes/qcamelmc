import { describe, expect, it } from "vitest";
import { invoiceScanDetail, invoiceScanLabel, invoiceTicketScan } from "@/lib/invoiceTicketScan";

describe("invoiceTicketScan", () => {
  it("treats a present holder as already scanned", () => {
    const scan = invoiceTicketScan([
      { is_present: true, confirmed_at: "2026-11-12T07:03:00Z", confirmed_by_name: "أسامة" },
      { is_present: false, confirmed_at: null, confirmed_by_name: null },
    ]);
    expect(scan).toEqual({
      total: 2,
      scanned: 1,
      all: false,
      at: "2026-11-12T07:03:00Z",
      by: "أسامة",
    });
    expect(invoiceScanLabel(scan)).toBe("تم مسح 1 من 2");
    expect(invoiceScanDetail(scan)).toContain("أسامة");
  });

  it("keeps a single scanned ticket as scanned and reports the latest staff member", () => {
    const scan = invoiceTicketScan([
      { is_present: true, confirmed_at: "2026-11-12T07:00:00Z", confirmed_by_name: "خالد" },
      { is_present: true, confirmed_at: "2026-11-12T09:30:00Z", confirmed_by_name: "أسامة" },
    ]);
    expect(scan.scanned).toBe(2);
    expect(scan.all).toBe(true);
    expect(scan.at).toBe("2026-11-12T09:30:00Z");
    expect(scan.by).toBe("أسامة");
    expect(invoiceScanLabel(scan)).toBe("تم مسح 2 من 2");
  });

  it("returns no scan state when nothing was scanned", () => {
    const scan = invoiceTicketScan([{ is_present: false }, { is_present: null }]);
    expect(scan.scanned).toBe(0);
    expect(scan.all).toBe(false);
    expect(invoiceScanLabel(scan)).toBeNull();
  });

  it("handles missing holder rows without inventing a scan", () => {
    expect(invoiceTicketScan(undefined)).toEqual({ total: 0, scanned: 0, all: false, at: null, by: null });
    expect(invoiceScanLabel(invoiceTicketScan([]))).toBeNull();
    expect(invoiceScanDetail(invoiceTicketScan([]))).toBe("تم المسح بواسطة البوابة");
  });

  it("keeps a scanned ticket without a time as scanned but without a timestamp", () => {
    const scan = invoiceTicketScan([{ is_present: true, confirmed_at: null, confirmed_by_name: "أسامة" }]);
    expect(scan.scanned).toBe(1);
    expect(scan.at).toBeNull();
    expect(scan.by).toBeNull();
    expect(invoiceScanLabel(scan)).toBe("تم المسح");
  });
});
