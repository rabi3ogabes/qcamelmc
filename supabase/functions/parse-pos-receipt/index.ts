import "../_shared/track-install.ts";

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.58.0";
import { staffIdentity, unauthorizedResponse } from "../_shared/staffAuth.ts";
import { generateChatCompletion, GatewayError } from "npm:@lovable.dev/ai-gateway@0.1.11";
import { RECEIPT_OUTPUT, parseReceiptOutput } from "./output.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  let releaseSlot: (() => Promise<void>) | undefined;
  try {
    const { imageBase64, passcode } = await req.json();

    // Every call costs AI credits: staff only (administrator, moderator or the team passcode).
    const url = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !serviceKey) throw new Error("Service unavailable");
    const admin = createClient(url, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const identity = await staffIdentity(req, admin, passcode);
    if (!identity) return unauthorizedResponse(corsHeaders);

    if (typeof imageBase64 === "string" && imageBase64.length > 8_000_000) {
      return new Response(
        JSON.stringify({ error: "Image is too large" }),
        { status: 413, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    if (typeof imageBase64 !== "string" || !/^[A-Za-z0-9+/]+={0,2}$/.test(imageBase64)) {
      return new Response(
        JSON.stringify({ error: "No image provided" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const subject = identity.userId ? `user:${identity.userId}` : "shared:passcode";
    const lease = crypto.randomUUID();
    const { data: slot, error: slotError } = await admin.rpc("acquire_receipt_ai_slot", { p_subject: subject, p_lease: lease });
    if (slotError) throw new Error("Usage verification unavailable");
    if (!slot?.allowed) {
      const retry = String(slot?.retry_after || 60);
      return new Response(JSON.stringify({ error: slot?.reason === "busy" ? "توجد قراءة قيد التنفيذ، حاول بعد قليل" : "وصلت إلى حد 10 قراءات خلال 10 دقائق، حاول لاحقًا", retry_after: Number(retry) }), {
        status: 429, headers: { ...corsHeaders, "Content-Type": "application/json", "Retry-After": retry },
      });
    }
    releaseSlot = async () => {
      const { error } = await admin.rpc("release_receipt_ai_slot", { p_subject: subject, p_lease: lease });
      if (error) console.warn("Receipt AI lease release failed");
    };

    const systemPrompt = `You are an AI specialized in reading POS receipt images.

When you receive an image of a payment receipt, extract ONLY the following fields and return VALID JSON:

- amount_qar (number)
- seq_number (string)
- card_number_masked (string)
- time (HH:MM:SS)
- auth_number (string)

Extraction rules:

- amount_qar must be a number without currency symbols (e.g., 1000 not "QAR 1000.00").
- seq_number must match the SEQ NO / SEQ NUMBER on the receipt.
- card_number_masked must keep the masking exactly as shown (**** allowed).
- time must be in 24-hour format HH:MM:SS.
- auth_number must match AUTH NO / AUTH NUMBER.
- If any field is missing or unreadable, return null for that field.
- Do NOT guess or infer values.
- Do NOT include explanations, comments, or extra text.
- Return ONLY the JSON object, nothing else.`;

    const data = await generateChatCompletion({
        ...RECEIPT_OUTPUT,
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: systemPrompt },
          {
            role: "user",
            content: [
              {
                type: "image_url",
                image_url: {
                  url: `data:image/jpeg;base64,${imageBase64}`,
                },
              },
              {
                type: "text",
                text: "Extract the receipt data from this POS receipt image and return it as JSON.",
              },
            ],
          },
        ],
    }, { signal: AbortSignal.timeout(60000) });
    const content = data.choices?.[0]?.message?.content || "";
    
    // Try to parse the JSON from the response
    let extractedData;
    try {
      extractedData = parseReceiptOutput(content, data.choices?.[0]?.finish_reason);
    } catch (parseError) {
      console.warn("Incomplete receipt response", data.choices?.[0]?.finish_reason);
      return new Response(
        JSON.stringify({ error: "Receipt reading was incomplete. Please retry the photo." }),
        { status: 422, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ success: true, data: extractedData }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    if (error instanceof GatewayError) {
      console.warn("Receipt gateway failure", error.code, error.httpStatus);
      const status = error.httpStatus === 402 || error.httpStatus === 429 ? error.httpStatus : 500;
      return new Response(JSON.stringify({error: status === 402 ? "Receipt reading needs workspace AI credits." : status === 429 ? "Receipt reading is busy. Please try later." : "Receipt reading failed. Please try again."}), {status, headers:{...corsHeaders,"Content-Type":"application/json"}});
    }
    console.error("Error in parse-pos-receipt:", error);
    return new Response(
      JSON.stringify({ error: "تعذرت قراءة الإيصال، يرجى المحاولة لاحقًا" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } finally {
    if (releaseSlot) await releaseSlot().catch(() => console.warn("Receipt AI lease release unavailable"));
  }
});
