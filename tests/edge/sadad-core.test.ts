import { createHash } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  SADAD_CHECKOUT_URL,
  amountsMatch,
  buildCheckoutRequest,
  normalizePaymentPayload,
  signRequest,
  toSadadMobile,
  verifyChecksum,
} from "../../supabase/functions/_shared/sadad-core.ts";

const SECRET = "S3CR3T";

// Independent implementation of the documented algorithm (Web Checkout 2.1):
// SHA256(secret + values of all params sorted by key), uppercase hex.
const referenceSignature = (params: Record<string, string>, secret: string) => {
  const s = secret + Object.keys(params).sort().map((k) => params[k]).join("");
  return createHash("sha256").update(s).digest("hex").toUpperCase();
};

const signedFields = {
  merchant_id: "1664851",
  ORDER_ID: "QTR-ABC123DEF456",
  TXN_AMOUNT: "150.00",
  WEBSITE: "example.qa",
  CALLBACK_URL: "https://x.supabase.co/functions/v1/sadad-callback",
  MOBILE_NO: "97455512345",
  EMAIL: "a@b.qa",
  txnDate: "2026-10-09",
};

describe("signRequest", () => {
  it("matches the published reference vector", async () => {
    expect(await signRequest(signedFields, SECRET)).toBe(
      "6A6D258727B321A8EC7C02CAFD96B2F14D754BA1627029F2920D27E11F4D0B49",
    );
  });

  it("does not depend on the insertion order of the parameters", async () => {
    const shuffled = Object.fromEntries(Object.entries(signedFields).reverse());
    expect(await signRequest(shuffled, SECRET)).toBe(await signRequest(signedFields, SECRET));
  });

  it("sorts keys by byte order (uppercase before lowercase), like PHP ksort", async () => {
    // merchant_id (lowercase) must sort AFTER WEBSITE (uppercase)
    const sig = await signRequest(signedFields, SECRET);
    expect(sig).toBe(referenceSignature(signedFields, SECRET));
  });

  it("never URL-encodes values", async () => {
    const odd = { ...signedFields, ORDER_ID: "A B/C?x=1&y=2" };
    expect(await signRequest(odd, SECRET)).toBe(referenceSignature(odd, SECRET));
  });

  it("ignores the signature field and product detail lines", async () => {
    const withExtras = {
      ...signedFields,
      signature: "SHOULD_BE_IGNORED",
      "productdetail[0][order_id]": "x",
      "productdetail[0][amount]": "1.00",
    };
    expect(await signRequest(withExtras, SECRET)).toBe(await signRequest(signedFields, SECRET));
  });

  it("changes when the secret or any value changes", async () => {
    const base = await signRequest(signedFields, SECRET);
    expect(await signRequest(signedFields, SECRET + "x")).not.toBe(base);
    expect(await signRequest({ ...signedFields, TXN_AMOUNT: "1.00" }, SECRET)).not.toBe(base);
  });
});

describe("buildCheckoutRequest", () => {
  const input = {
    merchantId: "1664851",
    secret: SECRET,
    orderId: "QTR-ABC123DEF456",
    amount: 150,
    website: "example.qa",
    callbackUrl: "https://x.supabase.co/functions/v1/sadad-callback",
    mobile: "97455512345",
    email: "a@b.qa",
    now: new Date("2026-10-09T10:00:00Z"),
    items: [{ name: "VIP ticket", price: 100, quantity: 1 }, { name: "Parking", price: 50, quantity: 1 }],
  };

  it("posts to the documented Sadad endpoint", async () => {
    const req = await buildCheckoutRequest(input);
    expect(req.url).toBe(SADAD_CHECKOUT_URL);
    expect(SADAD_CHECKOUT_URL).toBe("https://sadadqa.com/webpurchase");
  });

  it("formats the amount with two decimals and signs the mandatory fields", async () => {
    const { fields } = await buildCheckoutRequest(input);
    expect(fields.TXN_AMOUNT).toBe("150.00");
    expect(fields.signature).toBe(
      "6A6D258727B321A8EC7C02CAFD96B2F14D754BA1627029F2920D27E11F4D0B49",
    );
  });

  it("uses the Qatar calendar date (UTC+3) for txnDate", async () => {
    const late = await buildCheckoutRequest({ ...input, now: new Date("2026-10-09T21:30:00Z") });
    expect(late.fields.txnDate).toBe("2026-10-10");
  });

  it("flattens product lines into unsigned productdetail fields", async () => {
    const { fields } = await buildCheckoutRequest(input);
    expect(fields["productdetail[0][order_id]"]).toBe("QTR-ABC123DEF456");
    expect(fields["productdetail[0][itemname]"]).toBe("VIP ticket");
    expect(fields["productdetail[0][amount]"]).toBe("100.00");
    expect(fields["productdetail[0][quantity]"]).toBe("1");
    expect(fields["productdetail[1][amount]"]).toBe("50.00");
  });

  it("rounds amounts using integer cents (no float drift)", async () => {
    const { fields } = await buildCheckoutRequest({ ...input, amount: 10.005 + 0.1 });
    expect(fields.TXN_AMOUNT).toMatch(/^\d+\.\d{2}$/);
    const small = await buildCheckoutRequest({ ...input, amount: 0.1 + 0.2 });
    expect(small.fields.TXN_AMOUNT).toBe("0.30");
  });

  it.each([0, -5, Number.NaN, Number.POSITIVE_INFINITY])("rejects invalid amount %s", async (amount) => {
    await expect(buildCheckoutRequest({ ...input, amount })).rejects.toThrow(/amount/i);
  });

  it("rejects a missing secret or merchant id", async () => {
    await expect(buildCheckoutRequest({ ...input, secret: "" })).rejects.toThrow(/secret/i);
    await expect(buildCheckoutRequest({ ...input, merchantId: "" })).rejects.toThrow(/merchant/i);
  });

  it("rejects non-https callback urls", async () => {
    await expect(
      buildCheckoutRequest({ ...input, callbackUrl: "http://insecure.example/cb" }),
    ).rejects.toThrow(/https/i);
  });
});

describe("verifyChecksum (callback / webhook)", () => {
  const callback = {
    MID: "1664851",
    ORDERID: "QTR-ABC123DEF456",
    RESPCODE: "3",
    RESPMSG: "Txn Success",
    TXNAMOUNT: "150.00",
    STATUS: "TXN_SUCCESS",
    transaction_number: "SD2883696582255",
    transaction_status: "3",
    website_ref_no: "QTR-ABC123DEF456",
    issandboxmode: "1",
  };
  const HASH = "6082cc9b43e1c98b95f4911c9b696810cfa912f4a88e306217500a144bf26b8a";

  it("accepts a correctly signed callback", async () => {
    expect(await verifyChecksum({ ...callback, checksumhash: HASH }, SECRET)).toBe(true);
  });

  it("compares case-insensitively", async () => {
    expect(await verifyChecksum({ ...callback, checksumhash: HASH.toUpperCase() }, SECRET)).toBe(true);
  });

  it("rejects a tampered amount", async () => {
    expect(await verifyChecksum({ ...callback, TXNAMOUNT: "1.00", checksumhash: HASH }, SECRET)).toBe(false);
  });

  it("rejects a wrong secret and a missing hash", async () => {
    expect(await verifyChecksum({ ...callback, checksumhash: HASH }, "other")).toBe(false);
    expect(await verifyChecksum(callback, SECRET)).toBe(false);
    expect(await verifyChecksum({ ...callback, checksumhash: "" }, SECRET)).toBe(false);
  });

  it("stringifies JSON webhook values like PHP does (numbers as-is, null as empty)", async () => {
    const webhook = {
      isTestMode: 1,
      merchantId: 1664851,
      message: "success",
      transactionNumber: "SD1",
      transactionStatus: 3,
      txnAmount: 150,
      websiteRefNo: "QTR-ABC123DEF456",
      invoiceNumber: null,
    };
    const asStrings = {
      isTestMode: "1",
      merchantId: "1664851",
      message: "success",
      transactionNumber: "SD1",
      transactionStatus: "3",
      txnAmount: "150",
      websiteRefNo: "QTR-ABC123DEF456",
      invoiceNumber: "",
    };
    const checksumhash = referenceSignature(asStrings, SECRET).toLowerCase();
    expect(await verifyChecksum({ ...webhook, checksumhash }, SECRET)).toBe(true);
  });
});

describe("why a valid checksum is NOT proof of payment", () => {
  // Sadad signs `secret + values sorted by key` for requests AND for callbacks,
  // with no separators or domain separation. Our server signs a request that
  // contains customer-chosen text (email, phone), so a customer can re-split
  // the SAME string into the fields of a "paid" callback and reuse our own
  // signature as its checksum. This test documents the attack; the defence is
  // that payments are confirmed with Sadad's API, never by a checksum alone.
  it("lets a customer reuse a request signature as a forged callback checksum", async () => {
    const request = {
      merchant_id: "1664851",
      ORDER_ID: "QTR-ABC123DEF456",
      TXN_AMOUNT: "3.00",
      WEBSITE: "example.qa",
      CALLBACK_URL: "https://x.supabase.co/functions/v1/sadad-callback",
      MOBILE_NO: "97455512345",
      EMAIL: "a@b.qa",
      txnDate: "2026-10-13",
    };
    const requestSignature = (await signRequest(request, SECRET)).toLowerCase();

    // request values in key order: CALLBACK_URL EMAIL MOBILE_NO ORDER_ID TXN_AMOUNT WEBSITE merchant_id txnDate
    const forged = {
      AAA: "https://x.supabase.co/functions/v1/sadad-callbacka@b.qa97455512345",
      ORDERID: "QTR-ABC123DEF456",
      TXNAMOUNT: "3.00",
      issandboxmode: "example.qa1664851202",
      transaction_number: "6-10-1",
      transaction_status: "3",
      website_ref_no: "",
      checksumhash: requestSignature,
    };

    expect(await verifyChecksum(forged, SECRET)).toBe(true);
    expect(normalizePaymentPayload(forged)).toMatchObject({ status: "success", orderRef: "QTR-ABC123DEF456", amount: 3 });
  });
});

describe("normalizePaymentPayload", () => {
  it("reads a successful form callback", () => {
    const n = normalizePaymentPayload({
      ORDERID: "QTR-ABC123DEF456",
      transaction_status: "3",
      STATUS: "TXN_SUCCESS",
      TXNAMOUNT: "150.00",
      transaction_number: "SD2883696582255",
      issandboxmode: "1",
    });
    expect(n).toMatchObject({
      orderRef: "QTR-ABC123DEF456",
      transactionNumber: "SD2883696582255",
      status: "success",
      amount: 150,
      sandbox: true,
    });
  });

  it("maps failed and in-progress callbacks", () => {
    expect(normalizePaymentPayload({ ORDERID: "R", transaction_status: "2" })?.status).toBe("failed");
    expect(normalizePaymentPayload({ ORDERID: "R", transaction_status: "7" })?.status).toBe("failed");
    expect(normalizePaymentPayload({ ORDERID: "R", transaction_status: "1" })?.status).toBe("in_progress");
  });

  it("falls back to STATUS when transaction_status is absent", () => {
    expect(normalizePaymentPayload({ ORDERID: "R", STATUS: "TXN_SUCCESS" })?.status).toBe("success");
    expect(normalizePaymentPayload({ ORDERID: "R", STATUS: "TXN_FAILURE" })?.status).toBe("failed");
  });

  it("reads a JSON webhook", () => {
    const n = normalizePaymentPayload({
      websiteRefNo: "QTR-ABC123DEF456",
      transactionNumber: "SD9",
      transactionStatus: 3,
      txnAmount: 99.5,
      isTestMode: 0,
      message: "success",
    });
    expect(n).toMatchObject({
      orderRef: "QTR-ABC123DEF456",
      transactionNumber: "SD9",
      status: "success",
      amount: 99.5,
      sandbox: false,
    });
  });

  it("never treats an unknown status as success", () => {
    expect(normalizePaymentPayload({ ORDERID: "R", transaction_status: "9" })?.status).toBe("unknown");
    expect(normalizePaymentPayload({ ORDERID: "R", RESPCODE: "1" })?.status).toBe("unknown");
  });

  it("returns null when there is no order reference", () => {
    expect(normalizePaymentPayload({ transaction_status: "3" })).toBeNull();
    expect(normalizePaymentPayload(null as never)).toBeNull();
    expect(normalizePaymentPayload({ ORDERID: "bad ref with spaces!" })).toBeNull();
  });
});

describe("amountsMatch", () => {
  it.each([
    ["150.00", 150, true],
    [150, "150", true],
    ["99.5", 99.5, true],
    [150.004, 150, true],
    [149.99, 150, false],
    ["abc", 150, false],
    [null, 150, false],
    [undefined, undefined, false],
  ])("amountsMatch(%s, %s) = %s", (a, b, expected) => {
    expect(amountsMatch(a as never, b as never)).toBe(expected);
  });
});

describe("toSadadMobile", () => {
  it.each([
    ["55512345", "+974", "97455512345"],
    ["+974 5551 2345", "+974", "97455512345"],
    ["0097455512345", "+974", "97455512345"],
    ["97455512345", "+974", "97455512345"],
    ["0555 1234", "+966", "9665551234"],
    ["55512345", "", "97455512345"],
    // a number's own "+code" always wins over the record's default country code
    ["+966 5551 0001", "+974", "96655510001"],
    ["+20 100 123 4567", "+974", "201001234567"],
  ])("toSadadMobile(%s, %s) = %s", (phone, cc, expected) => {
    expect(toSadadMobile(phone, cc)).toBe(expected);
  });
});
