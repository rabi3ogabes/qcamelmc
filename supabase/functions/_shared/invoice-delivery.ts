export function callbackOutcome(status: unknown): "sent" | "failed" {
  return status === "success" ? "sent" : "failed";
}

export interface DeliveryRecord { id: string; channel: string; status: string; attempt: number; }
export function deliveryCounts(records: DeliveryRecord[], channel: string) {
  const rows = records.filter(r => r.channel === channel);
  // Email provider and local sender can both log the same attempt; count once.
  const unique = (status: string) => new Set(rows.filter(r => r.status === status).map(r => channel === "email" ? r.attempt : r.id)).size;
  return { sent: unique("sent"), queued: unique("queued"), failed: unique("failed") };
}