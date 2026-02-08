import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.58.0";
import { toZonedTime } from "https://esm.sh/date-fns-tz@3.2.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Check if event has expired (after 6PM Qatar time on event day)
function isEventExpired(eventDate: string): boolean {
  const qatarTimeZone = "Asia/Qatar";
  const eventDateTime = toZonedTime(new Date(eventDate), qatarTimeZone);
  const currentQatarTime = toZonedTime(new Date(), qatarTimeZone);
  
  // Check if event date has passed
  if (eventDateTime < currentQatarTime) {
    const isSameDay = eventDateTime.toDateString() === currentQatarTime.toDateString();
    
    // If same day, check if it's past 6PM
    if (isSameDay) {
      const currentHour = currentQatarTime.getHours();
      return currentHour >= 18; // 6PM or later
    }
    
    // If it's a past day, it's expired
    return true;
  }
  
  return false;
}

// Check if current date (Qatar timezone) matches event date
function isEventDateToday(eventDate: string): boolean {
  const qatarTimeZone = "Asia/Qatar";
  const eventDateTime = toZonedTime(new Date(eventDate), qatarTimeZone);
  const currentQatarTime = toZonedTime(new Date(), qatarTimeZone);
  
  // Extract just the dates (without time) for comparison
  const eventDateOnly = new Date(eventDateTime.getFullYear(), eventDateTime.getMonth(), eventDateTime.getDate());
  const currentDateOnly = new Date(currentQatarTime.getFullYear(), currentQatarTime.getMonth(), currentQatarTime.getDate());
  
  return eventDateOnly.getTime() === currentDateOnly.getTime();
}

// Check if QR code is expired (due to event date change)
async function isQRCodeExpired(supabaseClient: any, qrCode: string): Promise<boolean> {
  const { data, error } = await supabaseClient
    .from('expired_qr_codes')
    .select('qr_code')
    .eq('qr_code', qrCode)
    .maybeSingle();
  
  if (error) {
    console.error('Error checking expired QR code:', error);
    return false;
  }
  
  return data !== null;
}

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
    ticket_holder_name?: string;
    ticket_holder_phone?: string;
    ticket_holder_nationality?: string;
    ticket_holder_id_number?: string;
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

    console.log(`[Ticket Check-in] Processing: ${booking_reference}`);

    if (!booking_reference) {
      console.error('[Ticket Check-in] Missing reference');
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

    // First, always try to find a ticket holder with this exact QR code
    // Only search in today's and upcoming events for faster lookup
    const qatarTimeZone = "Asia/Qatar";
    const nowInQatar = toZonedTime(new Date(), qatarTimeZone);
    const todayStr = `${nowInQatar.getFullYear()}-${String(nowInQatar.getMonth() + 1).padStart(2, '0')}-${String(nowInQatar.getDate()).padStart(2, '0')}`;
    
    console.log('[Ticket Check-in] Searching for ticket holder with QR code:', booking_reference, '| today:', todayStr);
    
    let { data: ticketHolder, error: holderError } = await supabase
      .from('ticket_holders')
      .select(`
        id,
        name,
        phone,
        nationality,
        ticket_type,
        qr_code,
        is_present,
        confirmed_at,
        confirmed_by,
        order_id,
        id_number,
        orders!inner (
          id,
          booking_reference,
          payment_status,
          payment_method,
          total_amount,
          quantity,
          ticket_type,
          n8n_responded_at,
          customers!inner (
            name,
            email,
            phone
          ),
          events!inner (
            title,
            event_date,
            location
          )
        )
      `)
      .eq('qr_code', booking_reference)
      .gte('orders.events.event_date', todayStr)
      .maybeSingle();

    console.log('[Ticket Check-in] Ticket holder search result:', ticketHolder ? 'FOUND' : 'NOT FOUND');
    console.log('[Ticket Check-in] Ticket holder search error:', holderError);
    
    // If found a ticket holder, process it
    if (ticketHolder) {
      console.log('[Ticket Check-in] Found ticket holder');
      console.log('[Ticket Check-in] Query result:', JSON.stringify(ticketHolder, null, 2));

      const order: any = Array.isArray(ticketHolder.orders) ? ticketHolder.orders[0] : ticketHolder.orders;

      // Check if event has expired (after 6PM on event day)
      const eventDate = (Array.isArray(order.events) ? order.events[0]?.event_date : order.events?.event_date);
      const formattedEventDate = eventDate ? new Date(eventDate).toLocaleDateString('ar-u-nu-latn', { 
        year: 'numeric', 
        month: 'long', 
        day: 'numeric' 
      }) : '';
      
      if (eventDate && isEventExpired(eventDate)) {
        console.warn(`[Ticket Check-in] Event expired for: ${booking_reference}`);
        return new Response(
          JSON.stringify({
            success: false,
            error: 'Event expired',
            message: `⏰ انتهت صلاحية التذكرة - الحدث انتهى في ${formattedEventDate}`,
            ticket_info: {
              booking_reference: order.booking_reference,
              customer_name: (Array.isArray(order.customers) ? order.customers[0]?.name : order.customers?.name) || 'غير معروف',
              event_title: (Array.isArray(order.events) ? order.events[0]?.title : order.events?.title) || 'غير معروف',
              ticket_type: ticketHolder.ticket_type,
              ticket_holder_name: ticketHolder.name,
              ticket_holder_phone: ticketHolder.phone,
              ticket_holder_nationality: ticketHolder.nationality,
              ticket_holder_id_number: ticketHolder.id_number,
              quantity: 1,
              payment_status: order.payment_status,
              is_present: ticketHolder.is_present,
            }
          } as CheckInResponse),
          { 
            status: 200,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
          }
        );
      }

      // Check if ticket can only be checked in on event day
      if (eventDate && !isEventDateToday(eventDate)) {
        console.warn(`[Ticket Check-in] Ticket can only be checked in on event date: ${booking_reference}`);
        return new Response(
          JSON.stringify({
            success: false,
            error: 'Wrong date',
            message: `📅 لا يمكن تسجيل الدخول - التذكرة صالحة فقط في ${formattedEventDate}`,
            ticket_info: {
              booking_reference: order.booking_reference,
              customer_name: (Array.isArray(order.customers) ? order.customers[0]?.name : order.customers?.name) || 'غير معروف',
              event_title: (Array.isArray(order.events) ? order.events[0]?.title : order.events?.title) || 'غير معروف',
              ticket_type: ticketHolder.ticket_type,
              ticket_holder_name: ticketHolder.name,
              ticket_holder_phone: ticketHolder.phone,
              ticket_holder_nationality: ticketHolder.nationality,
              ticket_holder_id_number: ticketHolder.id_number,
              quantity: 1,
              payment_status: order.payment_status,
              is_present: ticketHolder.is_present,
            }
          } as CheckInResponse),
          { 
            status: 200,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
          }
        );
      }

      // Check if already checked in first
      if (ticketHolder.is_present) {
        console.warn(`[Ticket Check-in] Already checked in: ${booking_reference}`);
        return new Response(
          JSON.stringify({
            success: false,
            error: 'Already checked in',
            message: 'تم استخدام التذكرة مسبقاً',
            ticket_info: {
              booking_reference: order.booking_reference,
              customer_name: (Array.isArray(order.customers) ? order.customers[0]?.name : order.customers?.name) || 'غير معروف',
              event_title: (Array.isArray(order.events) ? order.events[0]?.title : order.events?.title) || 'غير معروف',
              ticket_type: ticketHolder.ticket_type,
              ticket_holder_name: ticketHolder.name,
              ticket_holder_phone: ticketHolder.phone,
              ticket_holder_nationality: ticketHolder.nationality,
              ticket_holder_id_number: ticketHolder.id_number,
              quantity: 1,
              payment_status: order.payment_status,
              is_present: true,
              confirmed_at: ticketHolder.confirmed_at,
            }
          } as CheckInResponse),
          { 
            status: 200, 
            headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
          }
        );
      }

      // Validate payment status (but still return ticket info)
      // Force confirmed status for POS orders
      const isPOSOrder = order.booking_reference?.startsWith('POS-') || order.payment_method === 'cash_pos';
      const effectivePaymentStatus = isPOSOrder ? 'confirmed' : order.payment_status;
      
      if (effectivePaymentStatus !== 'confirmed') {
        console.warn(`[Ticket Check-in] Payment not confirmed for ${booking_reference}`);
        return new Response(
          JSON.stringify({
            success: false,
            error: 'Payment not confirmed',
            message: '⚠️ الدفع غير مؤكد - لا يمكن تسجيل الدخول',
            ticket_info: {
              booking_reference: order.booking_reference,
              customer_name: (Array.isArray(order.customers) ? order.customers[0]?.name : order.customers?.name) || 'غير معروف',
              event_title: (Array.isArray(order.events) ? order.events[0]?.title : order.events?.title) || 'غير معروف',
              ticket_type: ticketHolder.ticket_type,
              ticket_holder_name: ticketHolder.name,
              ticket_holder_phone: ticketHolder.phone,
              ticket_holder_nationality: ticketHolder.nationality,
              ticket_holder_id_number: ticketHolder.id_number,
              quantity: 1,
              payment_status: effectivePaymentStatus,
              is_present: ticketHolder.is_present,
            }
          } as CheckInResponse),
          { 
            status: 200,  // Changed to 200 so UI displays the info
            headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
          }
        );
      }

      // Mark ticket holder as present
      const confirmed_at = new Date().toISOString();
      const updateData: any = {
        is_present: true,
        confirmed_at: confirmed_at,
      };

      if (admin_id) {
        updateData.confirmed_by = admin_id;
      }

      const { error: updateError } = await supabase
        .from('ticket_holders')
        .update(updateData)
        .eq('id', ticketHolder.id);

      if (updateError) {
        console.error('[Ticket Check-in] Update failed:', updateError);
        throw updateError;
      }

      // Mark WhatsApp message as "sent via check-in" if not already sent
      if (!order.n8n_responded_at) {
        console.log('[Ticket Check-in] WhatsApp not sent, marking as manual check-in send');
        const { error: orderUpdateError } = await supabase
          .from('orders')
          .update({
            n8n_response_message: 'تم التسجيل يدوياً ✓',
            n8n_responded_at: confirmed_at
          })
          .eq('id', order.id);
        
        if (orderUpdateError) {
          console.error('[Ticket Check-in] Failed to update WhatsApp status:', orderUpdateError);
        } else {
          console.log('[Ticket Check-in] Marked WhatsApp as sent via check-in');
        }
      }

      console.log(`[Ticket Check-in] ✅ Successfully checked in ticket holder: ${ticketHolder.name}`);

      return new Response(
        JSON.stringify({
          success: true,
          message: `✅ تم التحقق من تذكرة ${ticketHolder.name}`,
          ticket_info: {
            booking_reference: order.booking_reference,
            customer_name: (Array.isArray(order.customers) ? order.customers[0]?.name : order.customers?.name) || 'غير معروف',
            event_title: (Array.isArray(order.events) ? order.events[0]?.title : order.events?.title) || 'غير معروف',
            ticket_type: ticketHolder.ticket_type,
            ticket_holder_name: ticketHolder.name,
            ticket_holder_phone: ticketHolder.phone,
            ticket_holder_nationality: ticketHolder.nationality,
            ticket_holder_id_number: ticketHolder.id_number,
            quantity: 1,
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
    }

    // Legacy: Handle order-level check-in by booking reference
    const { data: order, error: fetchError } = await supabase
      .from('orders')
      .select(`
        *,
        customers(name, email, phone),
        events!inner(title, event_date, location)
      `)
      .eq('booking_reference', booking_reference)
      .gte('events.event_date', todayStr)
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

    // Check if event has expired (after 6PM on event day)
    const legacyEventDate = order.events?.event_date;
    const legacyFormattedEventDate = legacyEventDate ? new Date(legacyEventDate).toLocaleDateString('ar-u-nu-latn', { 
      year: 'numeric', 
      month: 'long', 
      day: 'numeric' 
    }) : '';
    
    if (legacyEventDate && isEventExpired(legacyEventDate)) {
      console.warn(`[Ticket Check-in] Event expired for: ${booking_reference}`);
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Event expired',
          message: `⏰ انتهت صلاحية التذكرة - الحدث انتهى في ${legacyFormattedEventDate}`,
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
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    // Check if ticket can only be checked in on event day
    if (legacyEventDate && !isEventDateToday(legacyEventDate)) {
      console.warn(`[Ticket Check-in] Ticket can only be checked in on event date: ${booking_reference}`);
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Wrong date',
          message: `📅 لا يمكن تسجيل الدخول - التذكرة صالحة فقط في ${legacyFormattedEventDate}`,
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
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    // Validate payment status
    // Force confirmed status for POS orders
    const isPOSOrder = order.booking_reference?.startsWith('POS-') || order.payment_method === 'cash_pos';
    const effectivePaymentStatus = isPOSOrder ? 'confirmed' : order.payment_status;
    
    if (effectivePaymentStatus !== 'confirmed') {
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
            payment_status: effectivePaymentStatus,
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
          status: 200, 
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

    // Mark WhatsApp message as "sent via check-in" if not already sent
    if (!order.n8n_responded_at) {
      console.log('[Ticket Check-in] WhatsApp not sent, marking as manual check-in send');
      const { error: whatsappUpdateError } = await supabase
        .from('orders')
        .update({
          n8n_response_message: 'تم التسجيل يدوياً ✓',
          n8n_responded_at: confirmed_at
        })
        .eq('id', order.id);
      
      if (whatsappUpdateError) {
        console.error('[Ticket Check-in] Failed to update WhatsApp status:', whatsappUpdateError);
      } else {
        console.log('[Ticket Check-in] Marked WhatsApp as sent via check-in');
      }
    }

    console.log(`[Ticket Check-in] ✅ Successfully checked in: ${booking_reference}`);

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