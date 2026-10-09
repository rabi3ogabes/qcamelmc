// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { buildPaymentForm, redirectToSadad, rememberOrder, recallOrders } from "./payment";

const payment = {
  url: "https://sadadqa.com/webpurchase",
  fields: {
    merchant_id: "1664851",
    ORDER_ID: "QTR-ABC123DEF456",
    TXN_AMOUNT: "150.00",
    "productdetail[0][itemname]": 'تذكرة "VIP" & <more>',
    signature: "ABC123",
  },
};

describe("buildPaymentForm", () => {
  it("posts every field to Sadad as a hidden input, exactly as given", () => {
    const form = buildPaymentForm(document, payment);
    expect(form.method).toBe("post");
    expect(form.action).toBe("https://sadadqa.com/webpurchase");
    const inputs = Array.from(form.querySelectorAll("input")) as HTMLInputElement[];
    expect(inputs.every((i) => i.type === "hidden")).toBe(true);
    expect(Object.fromEntries(inputs.map((i) => [i.name, i.value]))).toEqual(payment.fields);
  });

  it("keeps awkward characters intact (set as DOM properties, never concatenated into HTML)", () => {
    const form = buildPaymentForm(document, payment);
    const input = form.querySelector('input[name="productdetail[0][itemname]"]') as HTMLInputElement;
    expect(input.value).toBe('تذكرة "VIP" & <more>');
    expect(form.querySelectorAll("input")).toHaveLength(5);
  });

  it("navigates the whole page (not a frame or new tab) so the customer lands back on the shop", () => {
    expect(buildPaymentForm(document, payment).target).toBe("_self");
  });

  it("refuses to send customer details anywhere except Sadad", () => {
    expect(() => buildPaymentForm(document, { ...payment, url: "https://evil.example/steal" })).toThrow(/sadad/i);
    expect(() => buildPaymentForm(document, { ...payment, url: "http://sadadqa.com/webpurchase" })).toThrow(/sadad/i);
    expect(() => buildPaymentForm(document, { ...payment, url: "https://sadadqa.com.evil.example/x" })).toThrow(/sadad/i);
  });
});

describe("redirectToSadad", () => {
  it("submits the form while it is attached to the page (browsers ignore detached forms)", () => {
    const connectedWhenSubmitted: boolean[] = [];
    const original = HTMLFormElement.prototype.submit;
    HTMLFormElement.prototype.submit = function (this: HTMLFormElement) {
      connectedWhenSubmitted.push(this.isConnected);
    };
    try {
      redirectToSadad(payment);
      expect(connectedWhenSubmitted).toEqual([true]);
    } finally {
      HTMLFormElement.prototype.submit = original;
    }
  });
});

describe("remembered orders", () => {
  it("remembers booking references (not database ids) and de-duplicates", () => {
    localStorage.clear();
    rememberOrder("QTR-A");
    rememberOrder("QTR-B");
    rememberOrder("QTR-A");
    expect(recallOrders()).toEqual(["QTR-B", "QTR-A"]);
  });

  it("keeps only the latest few and survives corrupted storage", () => {
    localStorage.clear();
    for (let i = 0; i < 15; i++) rememberOrder(`QTR-${i}`);
    expect(recallOrders()).toHaveLength(10);
    localStorage.setItem("orderRefs", "{not json");
    expect(recallOrders()).toEqual([]);
    localStorage.setItem("orderRefs", JSON.stringify(["ok", 5, null, "also ok"]));
    expect(recallOrders()).toEqual(["ok", "also ok"]);
  });
});
