// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import ChunkLoadErrorBoundary from "./ChunkLoadErrorBoundary";

vi.mock("@/lib/errorReporter", () => ({ reportError: vi.fn() }));
afterEach(() => { cleanup(); sessionStorage.clear(); vi.restoreAllMocks(); });

it("attempts guarded cached-chunk recovery even when the child fails on first mount", () => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  const write = vi.spyOn(Storage.prototype, "setItem");
  const Fail = () => { throw new Error("Failed to fetch dynamically imported module"); };
  render(<ChunkLoadErrorBoundary><Fail /></ChunkLoadErrorBoundary>);
  expect(write).toHaveBeenCalledWith("__lovable_chunk_reload_ts__", expect.any(String));
});

it("does not reload a generic API failure", () => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  const write = vi.spyOn(Storage.prototype, "setItem");
  const Fail = () => { throw new Error("Failed to fetch orders"); };
  render(<ChunkLoadErrorBoundary><Fail /></ChunkLoadErrorBoundary>);
  expect(write).not.toHaveBeenCalled();
});