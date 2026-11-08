export const ORDER_FESTIVAL = {
  from: "2026-11-07",
  to: "2026-11-14",
  toExclusive: "2026-11-15",
  startUtc: "2026-11-06T21:00:00.000Z",
  endUtc: "2026-11-14T21:00:00.000Z",
};

export function canManageOrders(identity: { kind: string } | null): boolean {
  return identity?.kind === "admin";
}

export function ordersReadMode(mode: unknown): "list" | "details" {
  if (mode === undefined || mode === "list") return "list";
  if (mode === "details") return "details";
  throw new Error("read_only");
}

export function isOrderFestivalDate(date: string): boolean {
  const instant = new Date(date).getTime();
  return instant >= Date.parse(ORDER_FESTIVAL.startUtc) && instant < Date.parse(ORDER_FESTIVAL.endUtc);
}