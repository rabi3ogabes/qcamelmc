import { expect, it } from "vitest";
import { STOCK_NOTIFICATION_VISIBLE_MS } from "./stockNotificationTiming";

it("keeps added-stock notifications visible for 10 seconds", () => {
  expect(STOCK_NOTIFICATION_VISIBLE_MS).toBe(10_000);
});