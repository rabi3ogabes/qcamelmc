import { describe, expect, it } from "vitest";
import { parseCreateOrderInput } from "../../supabase/functions/_shared/validation.ts";

const T1 = "11111111-1111-4111-8111-111111111111";
const T2 = "22222222-2222-4222-8222-222222222222";

const valid = () => ({
  customer: {
    name: "  Ahmed Al-Thani ",
    email: "ahmed@example.com",
    phone: "5551 2345",
    country_code: "+974",
    nationality: "قطر",
    id_number: "29850123456",
  },
  items: [{ ticket_id: T1, quantity: 2 }],
  holders: [
    { ticket_id: T1, name: "Ahmed Al-Thani", phone: "+974 5551 2345", nationality: "قطر", id_number: "29850123456" },
    { ticket_id: T1, name: "Sara Al-Thani", phone: "+974 5551 9999", nationality: "قطر", id_number: "29850123999" },
  ],
  payment_method: "sadad",
});

describe("parseCreateOrderInput", () => {
  it("accepts a valid order and trims/normalises fields", () => {
    const r = parseCreateOrderInput(valid());
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.value.customer.name).toBe("Ahmed Al-Thani");
    expect(r.value.customer.country_code).toBe("+974");
    expect(r.value.items).toEqual([{ ticket_id: T1, quantity: 2 }]);
    expect(r.value.holders).toHaveLength(2);
    expect(r.value.payment_method).toBe("sadad");
  });

  it("defaults country code to +974 and email to empty", () => {
    const body = valid();
    delete (body.customer as Record<string, unknown>).country_code;
    delete (body.customer as Record<string, unknown>).email;
    const r = parseCreateOrderInput(body);
    expect(r.ok && r.value.customer.country_code).toBe("+974");
    expect(r.ok && r.value.customer.email).toBe("");
  });

  it.each([null, undefined, 42, "x", []])("rejects a non-object body (%s)", (body) => {
    expect(parseCreateOrderInput(body).ok).toBe(false);
  });

  it("rejects an unknown payment method (price/status tampering surface)", () => {
    const r = parseCreateOrderInput({ ...valid(), payment_method: "free" });
    expect(r.ok).toBe(false);
  });

  it("ignores client-supplied prices, totals and statuses", () => {
    const body = { ...valid(), total_amount: 0.01, payment_status: "confirmed", price: 1 };
    const r = parseCreateOrderInput(body);
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.value).not.toHaveProperty("total_amount");
      expect(r.value).not.toHaveProperty("payment_status");
    }
  });

  it.each([0, -1, 1.5, 21, "2", null])("rejects item quantity %s", (quantity) => {
    const body = valid();
    (body.items[0] as Record<string, unknown>).quantity = quantity;
    expect(parseCreateOrderInput(body).ok).toBe(false);
  });

  it("rejects malformed ticket ids and duplicates", () => {
    const bad = valid();
    bad.items[0].ticket_id = "not-a-uuid";
    expect(parseCreateOrderInput(bad).ok).toBe(false);

    const dup = valid();
    dup.items = [{ ticket_id: T1, quantity: 1 }, { ticket_id: T1, quantity: 1 }];
    expect(parseCreateOrderInput(dup).ok).toBe(false);
  });

  it("requires exactly one holder per ticket, matched per ticket type", () => {
    const few = valid();
    few.holders = few.holders.slice(0, 1);
    expect(parseCreateOrderInput(few).ok).toBe(false);

    const wrongType = valid();
    wrongType.holders[1].ticket_id = T2;
    expect(parseCreateOrderInput(wrongType).ok).toBe(false);
  });

  it("collects every error so the form can show them together", () => {
    const body = valid();
    body.customer.name = "";
    body.customer.phone = "12";
    const r = parseCreateOrderInput(body);
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.errors.length).toBeGreaterThanOrEqual(2);
      expect(r.errors.join(" ")).toMatch(/name/i);
      expect(r.errors.join(" ")).toMatch(/phone/i);
    }
  });

  it("rejects overlong or control-character names", () => {
    const long = valid();
    long.customer.name = "x".repeat(101);
    expect(parseCreateOrderInput(long).ok).toBe(false);

    const ctl = valid();
    ctl.holders[0].name = "Ali\u0000\u0007";
    expect(parseCreateOrderInput(ctl).ok).toBe(false);
  });

  it("rejects an invalid email but allows it to be omitted", () => {
    const bad = valid();
    bad.customer.email = "not-an-email";
    expect(parseCreateOrderInput(bad).ok).toBe(false);
    const none = valid();
    none.customer.email = "";
    expect(parseCreateOrderInput(none).ok).toBe(true);
  });

  it("caps the number of tickets per request", () => {
    const body = valid();
    body.items = [{ ticket_id: T1, quantity: 20 }, { ticket_id: T2, quantity: 20 }];
    body.holders = Array.from({ length: 40 }, (_, i) => ({
      ticket_id: i < 20 ? T1 : T2,
      name: `Person ${i}`,
      phone: "+974 5551 2345",
      nationality: "قطر",
      id_number: `ID${i}${i}${i}`,
    }));
    expect(parseCreateOrderInput(body).ok).toBe(false);
  });
});
