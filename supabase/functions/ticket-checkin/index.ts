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

    // Check if QR code is expired (event date was changed)
    const isExpired = await isQRCodeExpired(supabase, booking_reference);
    if (isExpired) {
      console.warn(`[Ticket Check-in] Expired QR code used: ${booking_reference}`);
      return new Response(
        JSON.stringify({
          success: false,
          error: 'QR code expired',
          message: '❌ لا يمكن استخدام هذا الرمز - تم تغيير موعد الفعالية. يرجى الحصول على رمز QR جديد من لوحة الإدارة',
        } as CheckInResponse),
        { 
          status: 200,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
        }
      );
    }

    // Check if this is a ticket holder QR code (format: QTR-XXXXXXXX-TKT01)
    const isTicketHolderQR = booking_reference.includes('-TKT');
    
    if (isTicketHolderQR) {
      // Handle individual ticket holder check-in
      console.log('[Ticket Check-in] Processing individual ticket holder');
      console.log('[Ticket Check-in] QR code:', booking_reference);
      
      // Query ticket holder by QR code with proper foreign key syntax
      // First try exact match
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
        .maybeSingle();

      // If not found, try searching by QR code that contains the booking reference (handles URL vs plain code mismatch)
      if (!ticketHolder) {
        console.log('[Ticket Check-in] Exact match failed, trying partial match');
        const { data: ticketsData, error: ticketsError } = await supabase
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
          .ilike('qr_code', `%${booking_reference}%`);

        if (ticketsData && ticketsData.length > 0) {
          ticketHolder = ticketsData[0];
          holderError = ticketsError;
        }
      }

      console.log('[Ticket Check-in] Query result:', JSON.stringify(ticketHolder, null, 2));
      console.log('[Ticket Check-in] Query error:', JSON.stringify(holderError, null, 2));

      if (holderError || !ticketHolder) {
        console.error('[Ticket Check-in] Ticket holder not found:', holderError);
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

      const order: any = Array.isArray(ticketHolder.orders) ? ticketHolder.orders[0] : ticketHolder.orders;

      // Check if event has expired (after 6PM on event day)
      const eventDate = (Array.isArray(order.events) ? order.events[0]?.event_date : order.events?.event_date);
      if (eventDate && isEventExpired(eventDate)) {
        console.warn(`[Ticket Check-in] Event expired for: ${booking_reference}`);
        return new Response(
          JSON.stringify({
            success: false,
            error: 'Event expired',
            message: '⏰ انتهت صلاحية التذكرة - الحدث انتهى',
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

    // Check if event has expired (after 6PM on event day)
    if (order.events?.event_date && isEventExpired(order.events.event_date)) {
      console.warn(`[Ticket Check-in] Event expired for: ${booking_reference}`);
      return new Response(
        JSON.stringify({
          success: false,
          error: 'Event expired',
          message: '⏰ انتهت صلاحية التذكرة - الحدث انتهى',
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