import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.58.0'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const supabaseUrl = Deno.env.get('SUPABASE_URL')!
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    console.log('=== RECOVER PENDING ORDERS ===');

    // Find orders that are still pending after 5 minutes (likely stuck)
    const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    // Don't touch orders older than 24 hours (too old to auto-recover)
    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    const { data: pendingOrders, error: fetchError } = await supabase
      .from('orders')
      .select('id, booking_reference, total_amount, created_at, payment_method')
      .eq('payment_status', 'pending')
      .eq('payment_method', 'sadad')
      .lt('created_at', fiveMinutesAgo)
      .gt('created_at', twentyFourHoursAgo)
      .order('created_at', { ascending: false })
      .limit(50);

    if (fetchError) {
      console.error('Error fetching pending orders:', fetchError);
      throw fetchError;
    }

    console.log(`Found ${pendingOrders?.length || 0} stuck pending orders`);

    const results: { recovered: string[]; cancelled: string[]; errors: string[] } = {
      recovered: [],
      cancelled: [],
      errors: []
    };

    // For each pending order, mark as cancelled with a clear message
    // Since we can't verify with Sadad API, we cancel old pending orders
    // and instruct users to contact support if money was deducted
    for (const order of (pendingOrders || [])) {
      try {
        const minutesOld = Math.floor((Date.now() - new Date(order.created_at!).getTime()) / 60000);
        
        const { error: updateError } = await supabase
          .from('orders')
          .update({
            payment_status: 'cancelled',
            payment_error_reason: `انتهت مهلة الدفع بعد ${minutesOld} دقيقة. إذا تم خصم المبلغ من حسابكم، يرجى التواصل مع الدعم لتأكيد الطلب يدوياً.`
          })
          .eq('id', order.id)
          .eq('payment_status', 'pending'); // Only update if still pending (prevent race condition)

        if (updateError) {
          console.error(`Error updating order ${order.booking_reference}:`, updateError);
          results.errors.push(order.booking_reference);
        } else {
          console.log(`Cancelled stuck order ${order.booking_reference} (${minutesOld} min old)`);
          results.cancelled.push(order.booking_reference);
        }
      } catch (err) {
        console.error(`Error processing order ${order.booking_reference}:`, err);
        results.errors.push(order.booking_reference);
      }
    }

    console.log('Recovery results:', results);

    return new Response(
      JSON.stringify({
        success: true,
        total_found: pendingOrders?.length || 0,
        ...results
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
    );

  } catch (error) {
    console.error('Recovery error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
