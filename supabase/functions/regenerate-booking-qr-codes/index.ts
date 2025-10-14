import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.7.1';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    const { booking_reference } = await req.json();

    if (!booking_reference) {
      return new Response(
        JSON.stringify({ error: 'Missing booking_reference' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[QR Regenerate] Regenerating QR codes for booking: ${booking_reference}`);

    // Get the order ID from booking reference
    const { data: orderData, error: orderError } = await supabase
      .from('orders')
      .select('id')
      .eq('booking_reference', booking_reference)
      .maybeSingle();

    if (orderError) {
      console.error('Order fetch error:', orderError);
      return new Response(
        JSON.stringify({ error: orderError.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!orderData) {
      return new Response(
        JSON.stringify({ error: 'Booking reference not found' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Fetch all ticket holders for this order
    const { data: holders, error: fetchError } = await supabase
      .from('ticket_holders')
      .select('id, order_id')
      .eq('order_id', orderData.id);

    if (fetchError) {
      console.error('Fetch error:', fetchError);
      return new Response(
        JSON.stringify({ error: fetchError.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[QR Regenerate] Found ${holders?.length || 0} ticket holders`);

    let updated = 0;
    const errors: string[] = [];

    // Regenerate QR codes for each ticket holder
    for (let index = 0; index < (holders || []).length; index++) {
      const holder = holders![index];
      const ticketNumber = (index + 1).toString().padStart(2, '0');
      const newQrCode = `${booking_reference}-TKT${ticketNumber}`;

      console.log(`[QR Regenerate] Updating ticket ${holder.id} to ${newQrCode}`);

      try {
        const { error: updateError } = await supabase
          .from('ticket_holders')
          .update({ qr_code: newQrCode })
          .eq('id', holder.id);

        if (updateError) {
          console.error(`Update error for ticket ${holder.id}:`, updateError);
          errors.push(`Ticket ${holder.id}: ${updateError.message}`);
          continue;
        }

        updated++;
        console.log(`[QR Regenerate] Successfully updated ticket ${holder.id}`);

      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        console.error(`Error processing ticket ${holder.id}:`, error);
        errors.push(`Ticket ${holder.id}: ${errorMessage}`);
      }
    }

    console.log(`[QR Regenerate] Completed: ${updated} updated, ${errors.length} errors`);

    return new Response(
      JSON.stringify({ 
        success: true,
        updated,
        total: holders?.length || 0,
        errors: errors.length > 0 ? errors : undefined,
        message: `Successfully regenerated ${updated} QR codes for booking ${booking_reference}`
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('[QR Regenerate] Error:', error);
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
