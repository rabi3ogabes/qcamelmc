import { describe, expect, it } from "vitest";
import { buildPersonTicketTotals, normalizePersonKeys, personTotalFromMap } from "./personTicketTotals";

describe("personTicketTotals", () => {
  it("counts each loaded ticket row once per person", () => {
    const totals = buildPersonTicketTotals([
      { phone: "+974 3311 2233", id_number: "28912345678" },
      { phone: "33112233", id_number: "28912345678" },
      { phone: "+97455556677" },
    ]);
    expect(totals["id:28912345678"]).toBe(2);
    expect(totals["ph:33112233"]).toBe(2);
    expect(totals["ph:55556677"]).toBe(1);
  });

  it("ignores rows without a usable phone or ID", () => {
    const totals = buildPersonTicketTotals([{ phone: "123", id_number: "" }]);
    expect(totals).toEqual({});
    expect(normalizePersonKeys(undefined, undefined)).toEqual([]);
  });

  it("returns the actual-event total for the person, not a lifetime sum", () => {
    const totals = buildPersonTicketTotals([{ phone: "+97433112233", id_number: "28912345678" }]);
    expect(personTotalFromMap(totals, "+974 3311 2233", "28912345678")).toBe(1);
    expect(personTotalFromMap(totals, "+97433112233")).toBe(1);
    expect(personTotalFromMap(totals, "+97499990000")).toBe(0);
  });
});
