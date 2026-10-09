import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.58.0";
import { isAdminAuthorized, unauthorizedResponse } from "../_shared/staffAuth.ts";
import { makeQrGenerator } from "../_shared/qr.ts";
import { renderTicketQr } from "../_shared/qr-tools.ts";
import { createQrStorage, createRepo, type SupabaseLike } from "../_shared/repo.ts";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function generateQRCode(): string {
  // unguessable: a ticket code is the only thing that opens the gate
  const random = crypto.randomUUID().replace(/-/g, "").slice(0, 16);
  return `QR-${Date.now()}-${random}`.toUpperCase();
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { order_id, new_event_id } = await req.json();

    if (!order_id || !new_event_id) {
      return new Response(
        JSON.stringify({ error: 'Missing order_id or new_event_id' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Moving a booking invalidates its tickets: administrators only, the shared passcode is not enough.
    if (!(await isAdminAuthorized(req, supabase))) {
      return unauthorizedResponse(corsHeaders);
    }

    console.log(`[Change Event] Processing order: ${order_id}`);

    // 1. Get current order with its QR code
    const { data: order, error: orderError } = await supabase
      .from('orders')
      .select('qr_code, booking_reference')
      .eq('id', order_id)
      .single();

    if (orderError || !order) {
      console.error('[Change Event] Order not found:', orderError);
      return new Response(
        JSON.stringify({ error: 'Order not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // 2. Get all ticket holders for this order
    const { data: ticketHolders, error: ticketHoldersError } = await supabase
      .from('ticket_holders')
      .select('id, qr_code')
      .eq('order_id', order_id);

    if (ticketHoldersError) {
      console.error('[Change Event] Error fetching ticket holders:', ticketHoldersError);
      return new Response(
        JSON.stringify({ error: 'Error fetching ticket holders' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[Change Event] Found ${ticketHolders?.length || 0} ticket holders`);

    // 3. Store old QR codes in expired_qr_codes table
    const expiredQRCodes = [];
    
    // Add order QR code if exists
    if (order.qr_code) {
      expiredQRCodes.push({
        qr_code: order.qr_code,
        order_id: order_id,
        reason: 'event_date_changed'
      });
    }

    // Add all ticket holder QR codes
    if (ticketHolders && ticketHolders.length > 0) {
      ticketHolders.forEach(holder => {
        if (holder.qr_code) {
          expiredQRCodes.push({
            qr_code: holder.qr_code,
            order_id: order_id,
            reason: 'event_date_changed'
          });
        }
      });
    }

    // Insert expired QR codes
    if (expiredQRCodes.length > 0) {
      const { error: expiredError } = await supabase
        .from('expired_qr_codes')
        .insert(expiredQRCodes);

      if (expiredError) {
        console.error('[Change Event] Error storing expired QR codes:', expiredError);
        return new Response(
          JSON.stringify({ error: 'Error storing expired QR codes' }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      console.log(`[Change Event] Stored ${expiredQRCodes.length} expired QR codes`);
    }

    // 4. Get old event details before updating
    const { data: currentOrder } = await supabase
      .from('orders')
      .select('event_id')
      .eq('id', order_id)
      .single();

    const oldEventId = currentOrder?.event_id;

    const { data: oldEvent } = await supabase
      .from('events')
      .select('id, title, event_date, location')
      .eq('id', oldEventId)
      .single();

    const { data: newEvent } = await supabase
      .from('events')
      .select('id, title, event_date, location')
      .eq('id', new_event_id)
      .single();

    // 5. Generate new QR code for order
    const newOrderQRCode = generateQRCode();
    const { error: updateOrderError } = await supabase
      .from('orders')
      .update({ 
        event_id: new_event_id,
        qr_code: newOrderQRCode
      })
      .eq('id', order_id);

    if (updateOrderError) {
      console.error('[Change Event] Error updating order:', updateOrderError);
      // the database moves the booking's seats with it and refuses when the new event has no room
      if (/insufficient_stock/.test(updateOrderError.message ?? '')) {
        return new Response(
          JSON.stringify({ error: 'insufficient_stock', message: 'لا توجد تذاكر كافية في الفعالية الجديدة' }),
          { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      return new Response(
        JSON.stringify({ error: 'Error updating order' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[Change Event] Updated order with new QR code: ${newOrderQRCode}`);

    // 5. Generate new QR codes for all ticket holders
    let updatedHoldersCount = 0;
    const renewed: { id: string; qr_code: string }[] = [];
    if (ticketHolders && ticketHolders.length > 0) {
      for (const holder of ticketHolders) {
        const newHolderQRCode = generateQRCode();
        // the old picture encodes the old code: drop it, a fresh one is drawn below
        const { error: updateHolderError } = await supabase
          .from('ticket_holders')
          .update({ qr_code: newHolderQRCode, qr_image_url: null })
          .eq('id', holder.id);

        if (updateHolderError) {
          console.error(`[Change Event] Error updating ticket holder ${holder.id}:`, updateHolderError);
        } else {
          updatedHoldersCount++;
          renewed.push({ id: holder.id, qr_code: newHolderQRCode });
        }
      }
    }

    // New pictures for the new codes (best effort: a ticket also scans by its code).
    if (renewed.length > 0) {
      const sb = supabase as unknown as SupabaseLike;
      const qrDeps = {
        repo: createRepo(sb),
        storage: createQrStorage(sb),
        generateQr: makeQrGenerator({ loadLib: () => import("npm:qrcode@1.5.4"), fetch }),
      };
      await Promise.all(
        renewed.map((holder) =>
          renderTicketQr(qrDeps, holder).catch((e) => console.error('[Change Event] QR picture failed:', holder.qr_code, e)),
        ),
      );
    }

    console.log(`[Change Event] Updated ${updatedHoldersCount} ticket holders with new QR codes`);

    // 7. Log the event change in activity_logs
    await supabase.from('activity_logs').insert({
      activity_type: 'event_change',
      user_type: 'admin',
      action_data: {
        order_id: order_id,
        booking_reference: order.booking_reference,
        old_event_id: oldEventId,
        old_event_title: oldEvent?.title || 'Unknown',
        old_event_date: oldEvent?.event_date || '',
        new_event_id: new_event_id,
        new_event_title: newEvent?.title || 'Unknown',
        new_event_date: newEvent?.event_date || '',
      }
    });

    console.log(`[Change Event] Logged event change in activity_logs`);

    return new Response(
      JSON.stringify({ 
        success: true,
        message: 'Event changed and QR codes regenerated successfully',
        expired_qr_codes: expiredQRCodes.length,
        new_order_qr: newOrderQRCode,
        updated_ticket_holders: updatedHoldersCount
      }),
      { 
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );

  } catch (error) {
    console.error('[Change Event] Unexpected error:', error);
    return new Response(
      JSON.stringify({ 
        error: 'Internal server error', 
        details: error instanceof Error ? error.message : 'Unknown error' 
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});