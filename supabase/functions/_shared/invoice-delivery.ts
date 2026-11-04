export function callbackOutcome(status: unknown, messageId?: unknown, confirmed?: unknown): "sent" | "failed" {
  return status === "success" && confirmed === true && typeof messageId === "string" && messageId.trim().length > 0 && messageId.length <= 200 ? "sent" : "failed";
}

export interface DeliveryRecord { id: string; channel: string; status: string; attempt: number; provider_message_id?: string | null; provider_confirmed_at?: string | null; }
export function hasProviderProof(record: DeliveryRecord) {
  return record.status === "sent" && Boolean(record.provider_message_id?.trim() && record.provider_confirmed_at);
}
export function deliveryCounts(records: DeliveryRecord[], channel: string) {
  const rows = records.filter(r => r.channel === channel);
  // Email provider and local sender can both log the same attempt; count once.
  const unique = (status: string) => new Set(rows.filter(r => r.status === status && (channel !== "whatsapp" || status !== "sent" || hasProviderProof(r))).map(r => channel === "email" ? r.attempt : r.id)).size;
  return { sent: unique("sent"), queued: unique("queued"), failed: unique("failed"), attempts: new Set(rows.map(r => channel === "email" ? r.attempt : r.id)).size, unverified: rows.filter(r => channel === "whatsapp" && r.status === "sent" && !hasProviderProof(r)).length };
}