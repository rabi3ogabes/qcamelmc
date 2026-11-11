import "../_shared/track-install.ts";

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.58.0";
import { staffIdentity, unauthorizedResponse } from "../_shared/staffAuth.ts";
import { generateChatCompletion, GatewayError } from "npm:@lovable.dev/ai-gateway@0.1.11";
import { RECEIPT_OUTPUT, parseReceiptOutput } from "./output.ts";
import { receiptTicketPatch, receiptImage } from "./operations.ts";
import { DUPLICATE_RECEIPT_MESSAGE, isDuplicateReceiptError, receiptFullRowValues } from "./duplicates.ts";
import { ORDER_FESTIVAL } from "../_shared/orders-policy.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const duplicateReceiptResponse = () => new Response(
  JSON.stringify({ success: false, code: 'duplicate_receipt', error: DUPLICATE_RECEIPT_MESSAGE, message: DUPLICATE_RECEIPT_MESSAGE }),
  { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
);

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  let releaseSlot: (() => Promise<void>) | undefined;
  try {
    const { imageBase64, passcode, mode, receipt_id, field, value } = await req.json();

    // Every call costs AI credits: staff only (administrator, moderator or the team passcode).
    const url = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !serviceKey) throw new Error("Service unavailable");
    const admin = createClient(url, serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const identity = await staffIdentity(req, admin, passcode);
    if (!identity) return unauthorizedResponse(corsHeaders);

    if (mode === 'list') {
      const receipts: unknown[] = [];
      for (let offset = 0; ; offset += 1000) {
        const { data, error } = await admin.from('pos_receipts').select('*').order('created_at', { ascending: false }).range(offset, offset + 999);
        if (error) throw error;
        receipts.push(...(data ?? []));
        if (!data || data.length < 1000) break;
      }
      const { data: settings, error: settingsError } = await admin.from('settings').select('current_event_id').maybeSingle();
      if (settingsError) throw settingsError;
      const pricingEvents: unknown[] = [];
      for (let offset = 0; ; offset += 1000) {
        let query = admin.from('events').select('id,title,event_date,tickets(type,price)')
          .eq('is_active', true).eq('is_archived', false)
          .gte('event_date', ORDER_FESTIVAL.startUtc).lt('event_date', ORDER_FESTIVAL.endUtc)
          .order('event_date').range(offset, offset + 999);
        if (settings?.current_event_id) query = query.eq('id', settings.current_event_id);
        const { data, error } = await query;
        if (error) throw error;
        pricingEvents.push(...(data ?? []));
        if (!data || data.length < 1000) break;
      }
      return new Response(JSON.stringify({ success: true, receipts, pricing_events: pricingEvents }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    if (mode === 'update' || mode === 'delete') {
      if (typeof receipt_id !== 'string' || !/^[0-9a-f-]{36}$/i.test(receipt_id)) {
        return new Response(JSON.stringify({ error: 'Invalid receipt' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
      if (mode === 'update') {
        let patch;
        try { patch = receiptTicketPatch(field, value); } catch {
          return new Response(JSON.stringify({ error: 'Invalid receipt amount or ticket quantity' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
        }
        const { data, error } = await admin.from('pos_receipts').update(patch).eq('id', receipt_id).select('*').single();
        if (isDuplicateReceiptError(error)) return duplicateReceiptResponse();
        if (error) throw error;
        return new Response(JSON.stringify({ success: true, receipt: data }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
      }
      const { data: existing, error: fetchError } = await admin.from('pos_receipts').select('image_url').eq('id', receipt_id).single();
      if (fetchError) throw fetchError;
      const { error } = await admin.from('pos_receipts').delete().eq('id', receipt_id);
      if (error) throw error;
      const prefix = `${url}/storage/v1/object/public/pos-receipts/`;
      if (existing?.image_url?.startsWith(prefix)) await admin.storage.from('pos-receipts').remove([existing.image_url.slice(prefix.length)]);
      return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }
    let image;
    try { image = receiptImage(imageBase64); } catch (error) {
      return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'Invalid photo' }), { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    const subject = identity.userId ? `user:${identity.userId}` : "shared:passcode";
    const lease = crypto.randomUUID();
    const { data: slot, error: slotError } = await admin.rpc("acquire_receipt_ai_slot", { p_subject: subject, p_lease: lease });
    if (slotError) throw new Error("Usage verification unavailable");
    if (!slot?.allowed) {
      const retry = String(slot?.retry_after || 60);
      return new Response(JSON.stringify({ error: slot?.reason === "busy" ? "توجد قراءة قيد التنفيذ، حاول بعد قليل" : "وصلت إلى حد 30 قراءة خلال 10 دقائق، حاول لاحقًا", retry_after: Number(retry) }), {
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
                  url: `data:${image.mime};base64,${imageBase64}`,
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

    const { data: duplicate, error: duplicateError } = await admin.from('pos_receipts')
      .select('id').match(receiptFullRowValues(extractedData)).limit(1).maybeSingle();
    if (duplicateError) throw duplicateError;
    if (duplicate) return duplicateReceiptResponse();

    const path = `receipts/${crypto.randomUUID()}.${image.ext}`;
    const { error: uploadError } = await admin.storage.from('pos-receipts').upload(path, image.bytes, { contentType: image.mime, upsert: false });
    if (uploadError) throw new Error('Photo could not be saved. Please retry.');
    const { data: { publicUrl } } = admin.storage.from('pos-receipts').getPublicUrl(path);
    const { data: saved, error: saveError } = await admin.from('pos_receipts').insert({ ...extractedData, image_url: publicUrl, created_by: identity.userId }).select('*').single();
    if (saveError) {
      await admin.storage.from('pos-receipts').remove([path]);
      if (isDuplicateReceiptError(saveError)) return duplicateReceiptResponse();
      throw new Error('Receipt could not be saved. Please retry.');
    }
    return new Response(
      JSON.stringify({ success: true, data: extractedData, receipt: saved }),
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
