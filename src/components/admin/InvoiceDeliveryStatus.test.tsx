// @vitest-environment jsdom
import { act, cleanup, render } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { InvoiceDeliveryStatus } from "./InvoiceDeliveryStatus";

const { range } = vi.hoisted(() => ({ range: vi.fn() }));
vi.mock("@/integrations/supabase/client", () => ({ supabase: { from: () => ({ select: () => ({ eq: () => ({ order: () => ({ range }) }) }) }) } }));
afterEach(() => { cleanup(); vi.useRealTimers(); vi.clearAllMocks(); });

it("polls delivery history once per 30 seconds, not every five seconds, and pauses when hidden", async () => {
  vi.useFakeTimers();
  Object.defineProperty(document, "visibilityState", { configurable: true, value: "visible" });
  range.mockResolvedValue({ data: [], error: null });
  await act(async () => { render(<InvoiceDeliveryStatus orderId="order" />); });
  expect(range).toHaveBeenCalledTimes(1);
  await act(async () => { await vi.advanceTimersByTimeAsync(5000); });
  expect(range).toHaveBeenCalledTimes(1);
  await act(async () => { await vi.advanceTimersByTimeAsync(25000); });
  expect(range).toHaveBeenCalledTimes(2);
  Object.defineProperty(document, "visibilityState", { configurable: true, value: "hidden" });
  await act(async () => { await vi.advanceTimersByTimeAsync(30000); });
  expect(range).toHaveBeenCalledTimes(2);
});