export interface InvoiceDownloadSettings {
  invoice_pdf_download_enabled?: boolean | null;
  invoice_png_download_enabled?: boolean | null;
}

export const invoiceDownloadVisibility = (settings?: InvoiceDownloadSettings | null) => ({
  pdf: settings?.invoice_pdf_download_enabled !== false,
  png: settings?.invoice_png_download_enabled !== false,
});