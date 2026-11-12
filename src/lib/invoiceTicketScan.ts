/** Invoice rows: an issued ticket counts as "already scanned" only when its
 *  holder record is marked present by the gate scanner. */
export interface ScanHolder {
  is_present?: boolean | null;
  confirmed_at?: string | null;
  confirmed_by_name?: string | null;
}

export interface InvoiceTicketScan {
  total: number;
  scanned: number;
  all: boolean;
  at: string | null;
  by: string | null;
}

export function invoiceTicketScan(holders?: ScanHolder[] | null): InvoiceTicketScan {
  const rows = holders ?? [];
  const present = rows.filter(holder => holder.is_present === true);
  let at: string | null = null;
  let by: string | null = null;
  for (const holder of present) {
    const confirmedAt = holder.confirmed_at;
    if (!confirmedAt) continue;
    if (at === null || new Date(confirmedAt).getTime() > new Date(at).getTime()) {
      at = confirmedAt;
      by = holder.confirmed_by_name || null;
    }
  }
  return {
    total: rows.length,
    scanned: present.length,
    all: rows.length > 0 && present.length === rows.length,
    at,
    by,
  };
}

/** Arabic badge text; null when nothing was scanned yet. */
export function invoiceScanLabel(scan: InvoiceTicketScan): string | null {
  if (scan.scanned === 0) return null;
  if (scan.total > 1) return `تم مسح ${scan.scanned} من ${scan.total}`;
  return "تم المسح";
}

/** Tooltip detail: latest scan time in Qatar time, plus the staff member. */
export function invoiceScanDetail(scan: InvoiceTicketScan): string {
  if (scan.at === null) return "تم المسح بواسطة البوابة";
  const when = new Date(scan.at).toLocaleString("ar-u-nu-latn", {
    timeZone: "Asia/Qatar",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
  return scan.by ? `آخر مسح ${when} بواسطة ${scan.by}` : `آخر مسح ${when}`;
}
