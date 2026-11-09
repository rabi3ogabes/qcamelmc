interface NotificationOrder {
  ticket_type?: string;
  quantity?: number;
  ticket_holders?: { ticket_type: string }[];
}

export function bookingTicketBreakdown(order: NotificationOrder) {
  const counts = new Map<string, number>();
  const normalize = (type: string) => ({ 'عادي': 'normal', 'VIP': 'vip', 'مواقف': 'parking', 'موقف': 'parking' }[type] || type);
  if (order.ticket_holders?.length) {
    for (const holder of order.ticket_holders) {
      const type = normalize(holder.ticket_type);
      counts.set(type, (counts.get(type) || 0) + 1);
    }
  } else if (order.ticket_type) {
    counts.set(normalize(order.ticket_type), order.quantity || 1);
  }
  return [...counts].map(([type, quantity]) => ({ type, quantity }));
}