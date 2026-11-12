import { describe, expect, it } from "vitest";
import { invoiceDownloadVisibility } from "../src/lib/invoiceDownloadVisibility";

describe("invoice download settings", () => {
  it("keeps existing downloads available by default", () => {
    expect(invoiceDownloadVisibility(null)).toEqual({ pdf: true, png: true });
  });
  it("hides PDF independently of PNG", () => {
    expect(invoiceDownloadVisibility({ invoice_pdf_download_enabled: false, invoice_png_download_enabled: true }))
      .toEqual({ pdf: false, png: true });
  });
  it("hides PNG independently of PDF", () => {
    expect(invoiceDownloadVisibility({ invoice_pdf_download_enabled: true, invoice_png_download_enabled: false }))
      .toEqual({ pdf: true, png: false });
  });
  it("allows both buttons to be hidden", () => {
    expect(invoiceDownloadVisibility({ invoice_pdf_download_enabled: false, invoice_png_download_enabled: false }))
      .toEqual({ pdf: false, png: false });
  });
});