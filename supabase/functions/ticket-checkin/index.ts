import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.58.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface CheckInRequest {
  booking_reference: string;
  admin_id?: string;
}

interface CheckInResponse {
  success: boolean;
  message: string;
  ticket_info?: {
    booking_reference: string;
    customer_name: string;
    event_title: string;
    ticket_type: string;
    quantity: number;
    payment_status: string;
    is_present: boolean;
    confirmed_at?: string;
  };
  error?: string;
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Parse request body
    const { booking_reference, admin_id }: CheckInRequest = await req.json();

    console.log(`[Ticket Check-in] Processing booking: ${booking_reference}`);

    if (!booking_reference) {
      console.error('[Ticket Check-in] Missing booking reference');
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Booking reference is required',
          message: 'رقم الحجز مطلوب'
        } as CheckInResponse),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    // Query the order by booking reference with related data
    const { data: order, error: fetchError } = await supabase
      .from('orders')
      .select(`
        *,
        customers(name, email, phone),
        events(title, event_date, location)
      `)
      .eq('booking_reference', booking_reference)
      .single();

    if (fetchError || !order) {
      console.error('[Ticket Check-in] Order not found:', fetchError);
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Ticket not found',
          message: 'تذكرة غير موجودة'
        } as CheckInResponse),
        { 
          status: 404, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    // Validate payment status
    if (order.payment_status !== 'confirmed') {
      console.warn(`[Ticket Check-in] Payment not confirmed for ${booking_reference}`);
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Payment not confirmed',
          message: 'الدفع غير مؤكد',
          ticket_info: {
            booking_reference: order.booking_reference,
            customer_name: order.customers?.name || 'غير معروف',
            event_title: order.events?.title || 'غير معروف',
            ticket_type: order.ticket_type,
            quantity: order.quantity,
            payment_status: order.payment_status,
            is_present: order.is_present,
          }
        } as CheckInResponse),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    // Check if already checked in
    if (order.is_present) {
      console.warn(`[Ticket Check-in] Already checked in: ${booking_reference}`);
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Already checked in',
          message: 'تم استخدام التذكرة مسبقاً',
          ticket_info: {
            booking_reference: order.booking_reference,
            customer_name: order.customers?.name || 'غير معروف',
            event_title: order.events?.title || 'غير معروف',
            ticket_type: order.ticket_type,
            quantity: order.quantity,
            payment_status: order.payment_status,
            is_present: true,
            confirmed_at: order.confirmed_at,
          }
        } as CheckInResponse),
        { 
          status: 400, 
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    // Mark as present (checked in)
    const confirmed_at = new Date().toISOString();
    const updateData: any = {
      is_present: true,
      confirmed_at: confirmed_at,
    };

    if (admin_id) {
      updateData.confirmed_by = admin_id;
    }

    const { error: updateError } = await supabase
      .from('orders')
      .update(updateData)
      .eq('id', order.id);

    if (updateError) {
      console.error('[Ticket Check-in] Update failed:', updateError);
      throw updateError;
    }

    console.log(`[Ticket Check-in] ✅ Successfully checked in: ${booking_reference}`);

    // TODO: Add webhook notification here
    // await notifyWebhook({
    //   event: 'ticket.checkin',
    //   booking_reference,
    //   customer: order.customers,
    //   event: order.events,
    //   timestamp: confirmed_at
    // });

    return new Response(
      JSON.stringify({
        success: true,
        message: '✅ تم التحقق من التذكرة بنجاح',
        ticket_info: {
          booking_reference: order.booking_reference,
          customer_name: order.customers?.name || 'غير معروف',
          event_title: order.events?.title || 'غير معروف',
          ticket_type: order.ticket_type,
          quantity: order.quantity,
          payment_status: order.payment_status,
          is_present: true,
          confirmed_at: confirmed_at,
        }
      } as CheckInResponse),
      { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );

  } catch (error) {
    console.error('[Ticket Check-in] Error:', error);
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({
        success: false,
        error: errorMessage,
        message: 'خطأ في التحقق من التذكرة'
      } as CheckInResponse),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    );
  }
});
