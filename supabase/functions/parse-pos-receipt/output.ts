export const RECEIPT_OUTPUT = {
  max_tokens: 500,
  reasoning_effort: "none" as const,
  response_format: { type: "json_object" as const },
};

export function parseReceiptOutput(content: string, finishReason: string | null | undefined) {
  if (finishReason === "length") throw new Error("Receipt response was incomplete; please retry");
  const clean = content.trim().replace(/^```(?:json)?\s*/, "").replace(/\s*```$/, "");
  const value = JSON.parse(clean);
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid receipt data");
  const fields = ["amount_qar", "seq_number", "card_number_masked", "time", "auth_number"];
  if (!fields.every((key) => key in value)) throw new Error("Incomplete receipt fields");
  if (value.amount_qar !== null && (typeof value.amount_qar !== "number" || !Number.isFinite(value.amount_qar))) throw new Error("Invalid receipt amount");
  for (const field of fields.slice(1)) {
    if (value[field] !== null && typeof value[field] !== "string") throw new Error("Invalid receipt field");
  }
  return Object.fromEntries(fields.map((key) => [key, value[key]]));
}