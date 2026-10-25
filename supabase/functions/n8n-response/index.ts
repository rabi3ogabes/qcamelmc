import "../_shared/track-install.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.58.0'
import { corsHeaders } from 'npm:@supabase/supabase-js@2/cors'
import { callbackOutcome } from '../_shared/invoice-delivery.ts'

interface N8nResponsePayload {
  booking_reference: string;
  message: string;
  status?: 'success' | 'failed';
  delivery_id?: string;
}

// Optional shared secret. When N8N_RESPONSE_SECRET is set, the automation must send it
// (header `x-webhook-secret` or `Authorization: Bearer <secret>`); when it is not set the
// function keeps accepting calls so an existing workflow does not break on deploy.
function secretAccepted(req: Request): boolean {
  const expected = Deno.env.get('N8N_RESPONSE_SECRET');
  if (!expected) return true;
  const supplied =
    req.headers.get('x-webhook-secret') ?? (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '');
  if (supplied.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ supplied.charCodeAt(i);
  return diff === 0;
}

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  if (!secretAccepted(req)) {
    return new Response(JSON.stringify({ success: false, error: 'unauthorized' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Parse the request body
    const raw: unknown = await req.json();
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return new Response(JSON.stringify({ error: "Invalid callback" }), { status: 400, headers: corsHeaders });
    const payload = raw as N8nResponsePayload;
    if (typeof payload.booking_reference !== "string" || !/^[A-Za-z0-9][A-Za-z0-9_-]{0,59}$/.test(payload.booking_reference) || typeof payload.message !== "string" || !payload.message.trim()) return new Response(JSON.stringify({ error: "Invalid callback" }), { status: 400, headers: corsHeaders });
    
    if (req.method !== "POST") return new Response("Method not allowed", { status: 405, headers: corsHeaders });
    if (payload.delivery_id) {
      if (!/^[0-9a-f-]{36}$/i.test(payload.delivery_id) || !["success", "failed"].includes(payload.status ?? "") || typeof payload.message !== "string") {
        return new Response(JSON.stringify({ error: "Invalid delivery callback" }), { status: 400, headers: corsHeaders });
      }
      const { data: delivery, error: lookupError } = await supabase.from("email_delivery_events").select("id, order_id, booking_reference, status").eq("delivery_id", payload.delivery_id).eq("channel", "whatsapp").maybeSingle();
      if (lookupError || !delivery || delivery.booking_reference !== payload.booking_reference) return new Response(JSON.stringify({ error: "Unknown delivery" }), { status: 404, headers: corsHeaders });
      if (delivery.status !== "queued") return new Response(JSON.stringify({ success: true, duplicate: true }), { headers: corsHeaders });
      const { error: updateError } = await supabase.from("email_delivery_events").update({ status: callbackOutcome(payload.status), detail: payload.message.slice(0, 500) }).eq("id", delivery.id).eq("status", "queued");
      if (updateError) throw updateError;
      if (payload.status === "success") await supabase.from("orders").update({ n8n_response_message: payload.message.slice(0, 500), n8n_responded_at: new Date().toISOString(), send_attempt_count: 0 }).eq("id", delivery.order_id);
      return new Response(JSON.stringify({ success: true }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    // Reference-only legacy callbacks cannot certify new randomly identified attempts.
    const { data: tracked } = await supabase.from("email_delivery_events").select("id").eq("booking_reference", payload.booking_reference).eq("channel", "whatsapp").limit(1);
    if (tracked?.length) return new Response(JSON.stringify({ error: "Return delivery_id and explicit status for tracked invoices" }), { status: 400, headers: corsHeaders });

    if (typeof payload.message === 'string') payload.message = payload.message.slice(0, 500);

    // Validate required fields
    if (!payload.booking_reference || !payload.message) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Missing required fields: booking_reference and message' 
        }),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    // Update the order with n8n response
    const { data, error } = await supabase
      .from('orders')
      .update({
        n8n_response_message: payload.message,
        n8n_responded_at: new Date().toISOString(),
      })
      .eq('booking_reference', payload.booking_reference)
      .select()
      .single();

    if (error) {
      console.error('Database error:', error);
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Failed to update order',
          details: error.message 
        }),
        { 
          status: 500, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    if (!data) {
      return new Response(
        JSON.stringify({ 
          success: false, 
          error: 'Order not found with booking reference: ' + payload.booking_reference 
        }),
        { 
          status: 404, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    console.log('Successfully updated order:', data.id);

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: 'Order updated successfully',
        order_id: data.id,
        booking_reference: data.booking_reference
      }),
      { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );

  } catch (error) {
    console.error('Error processing n8n response:', error);
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: 'Internal server error',
        details: error instanceof Error ? error.message : 'Unknown error'
      }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});
