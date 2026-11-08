export interface ReceiptPriceEvent {
  id: string;
  title: string;
  event_date: string;
  tickets: { type: string; price: number }[];
}

export function receiptPrices(event: ReceiptPriceEvent | undefined) {
  const price = (type: string): number | null => {
    const aliases: Record<string, string> = { 'عادي': 'normal', 'VIP': 'vip', 'مواقف': 'parking' };
    const matches = event?.tickets.filter(ticket => (aliases[ticket.type] ?? ticket.type) === type) ?? [];
    if (matches.length !== 1) return null;
    const value = Number(matches[0].price);
    return Number.isFinite(value) && value >= 0 ? value : null;
  };
  return { normal: price('normal'), vip: price('vip'), parking: price('parking') };
}

export function receiptSummaryAmounts(
  totals: { normal: number; vip: number; parking: number },
  prices: ReturnType<typeof receiptPrices>,
) {
  const amount = (count: number, price: number | null) => count === 0 ? 0 : price === null ? null : Math.round(count * price * 100) / 100;
  const normal = amount(totals.normal, prices.normal);
  const vip = amount(totals.vip, prices.vip);
  const parking = amount(totals.parking, prices.parking);
  return { normal, vip, parking, total: normal === null || vip === null || parking === null ? null : Math.round((normal + vip + parking) * 100) / 100 };
}