import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.58.0";
import { toZonedTime } from "https://esm.sh/date-fns-tz@3.2.0";
import { isStaffAuthorized, unauthorizedResponse } from "../_shared/staffAuth.ts";

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
  staff_name?: string;
  mode?: 'checkin' | 'history' | 'search' | 'manual' | 'lookup';
  passcode?: string;
  search?: string;
  holder_id?: string;
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
    const { booking_reference, admin_id, staff_name, mode, passcode, search: searchInput, holder_id }: CheckInRequest = await req.json();

    if (!(await isStaffAuthorized(req, supabase, passcode))) {
      return unauthorizedResponse(corsHeaders);
    }

    // History mode: return the most recent successful check-ins
    if (mode === 'history') {
      const { data: history, error: historyError } = await supabase
        .from('ticket_holders')
        .select('id, name, ticket_type, qr_code, confirmed_at, confirmed_by_name, orders(booking_reference, events(title))')
        .eq('is_present', true)
        .not('confirmed_at', 'is', null)
        .order('confirmed_at', { ascending: false })
        .limit(30);

      if (historyError) {
        console.error('[Ticket Check-in] History failed:', historyError);
        return new Response(
          JSON.stringify({ success: false, message: 'تعذر جلب سجل المسح', history: [] }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      return new Response(
        JSON.stringify({ success: true, message: 'ok', history: history ?? [] }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Reset mode: undo a check-in. ADMIN ACCOUNT ONLY — passcode staff and
    // moderators are rejected. Requires a valid bearer token for a user who is
    // in public.admin_users or has the 'admin' role.
    if (mode === 'reset') {
      const authHeader = req.headers.get("Authorization") || "";
      const token = authHeader.replace("Bearer ", "").trim();
      if (!token) {
        return new Response(
          JSON.stringify({ success: false, message: 'إلغاء المسح متاح للأدمن فقط' }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      const { data: userData } = await supabase.auth.getUser(token);
      const userId = userData?.user?.id;
      let isAdmin = false;
      if (userId) {
        const { data: adminRow } = await supabase
          .from('admin_users').select('id').eq('id', userId).maybeSingle();
        if (adminRow) {
          isAdmin = true;
        } else {
          const { data: roleRow } = await supabase
            .from('user_roles').select('role').eq('user_id', userId).eq('role', 'admin').maybeSingle();
          isAdmin = !!roleRow;
        }
      }
      if (!isAdmin) {
        return new Response(
          JSON.stringify({ success: false, message: 'إلغاء المسح متاح للأدمن فقط' }),
          { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      if (!holder_id) {
        return new Response(
          JSON.stringify({ success: false, message: 'معرّف التذكرة مطلوب' }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      const { data: resetRows, error: resetError } = await supabase
        .from('ticket_holders')
        .update({ is_present: false, confirmed_at: null, confirmed_by: null, confirmed_by_name: null })
        .eq('id', holder_id)
        .eq('is_present', true)
        .select('id, name, qr_code');

      if (resetError) {
        console.error('[Ticket Check-in] Reset failed:', resetError);
        return new Response(
          JSON.stringify({ success: false, message: 'تعذر إلغاء المسح' }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      if (!resetRows || resetRows.length === 0) {
        return new Response(
          JSON.stringify({ success: false, message: 'التذكرة غير ممسوحة أصلاً' }),
          { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      await supabase.from('activity_logs').insert({
        activity_type: 'ticket_checkin_reset',
        user_type: 'admin',
        user_identifier: userId,
        action_data: { holder_id, qr_code: resetRows[0].qr_code, holder_name: resetRows[0].name },
      });

      return new Response(
        JSON.stringify({ success: true, message: 'تم إلغاء المسح، التذكرة صالحة من جديد' }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const qatarNow = toZonedTime(new Date(), "Asia/Qatar");
    const todayKey = `${qatarNow.getFullYear()}-${String(qatarNow.getMonth() + 1).padStart(2, '0')}-${String(qatarNow.getDate()).padStart(2, '0')}`;

    const HOLDER_SELECT = `
      id, name, phone, country_code, nationality, id_number, ticket_type, qr_code,
      is_present, confirmed_at, confirmed_by_name, order_id, created_at,
      orders!inner (
        id, booking_reference, payment_status, payment_method, n8n_responded_at,
        customers ( name, email, phone ),
        events!inner ( title, event_date, location )
      )
    `;

    // Lookup mode: read-only ticket lookup by QR code / booking reference (no check-in)
    if (mode === 'lookup') {
      const code = (booking_reference || '').trim();
      if (!code) {
        return new Response(JSON.stringify({ success: false, message: 'رقم التذكرة مطلوب', results: [] }), {
          status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      let { data: rows } = await supabase
        .from('ticket_holders')
        .select(HOLDER_SELECT)
        .eq('qr_code', code)
        .limit(20);

      if (!rows || rows.length === 0) {
        const res = await supabase
          .from('ticket_holders')
          .select(HOLDER_SELECT)
          .ilike('qr_code', `%${code.replace(/[%,()]/g, '')}%`)
          .limit(20);
        rows = res.data ?? [];
      }

      if (!rows || rows.length === 0) {
        const res = await supabase
          .from('ticket_holders')
          .select(HOLDER_SELECT)
          .eq('orders.booking_reference', code)
          .limit(20);
        rows = res.data ?? [];
      }

      const results = (rows ?? []).map((h: any) => {
        const order = Array.isArray(h.orders) ? h.orders[0] : h.orders;
        const ev = Array.isArray(order?.events) ? order.events[0] : order?.events;
        const cust = Array.isArray(order?.customers) ? order.customers[0] : order?.customers;
        return {
          id: h.id,
          name: h.name,
          phone: h.phone,
          nationality: h.nationality,
          id_number: h.id_number,
          ticket_type: h.ticket_type,
          qr_code: h.qr_code,
          is_present: h.is_present,
          confirmed_at: h.confirmed_at,
          confirmed_by_name: h.confirmed_by_name,
          order_id: h.order_id,
          orders: {
            booking_reference: order?.booking_reference,
            payment_status: order?.payment_status,
            payment_method: order?.payment_method,
            customers: { name: cust?.name || 'غير معروف' },
            events: { title: ev?.title || '', event_date: ev?.event_date || '' },
          },
        };
      });

      return new Response(JSON.stringify({ success: true, results }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Search mode: find ticket holders by name / phone / email / booking reference
    if (mode === 'search') {
      const value = (searchInput || '').trim();
      if (value.length < 2) {
        return new Response(JSON.stringify({ success: true, results: [] }), {
          status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      const like = `%${value.replace(/[%,()]/g, '')}%`;

      const holdersBase = () =>
        supabase
          .from('ticket_holders')
          .select(HOLDER_SELECT)
          .gte('orders.events.event_date', todayKey)
          .order('created_at', { ascending: false })
          .limit(40);

      // Orders whose customer matches the term
      const { data: custOrders } = await supabase
        .from('orders')
        .select('id, customers!inner(id)')
        .or(`name.ilike.${like},phone.ilike.${like},email.ilike.${like}`, { referencedTable: 'customers' })
        .order('created_at', { ascending: false })
        .limit(60);

      const orderIds = (custOrders ?? []).map((o: any) => o.id);

      const [byHolder, byRef, byCustomer] = await Promise.all([
        holdersBase().or(`name.ilike.${like},phone.ilike.${like},id_number.ilike.${like}`),
        holdersBase().ilike('orders.booking_reference', like),
        orderIds.length ? holdersBase().in('order_id', orderIds) : Promise.resolve({ data: [] } as any),
      ]);

      const merged = new Map<string, any>();
      [byHolder?.data ?? [], byRef?.data ?? [], byCustomer?.data ?? []].forEach((list: any[]) =>
        list.forEach((h) => merged.set(h.id, h))
      );

      const results = Array.from(merged.values()).map((h: any) => {
        const order = Array.isArray(h.orders) ? h.orders[0] : h.orders;
        const ev = Array.isArray(order?.events) ? order.events[0] : order?.events;
        const cust = Array.isArray(order?.customers) ? order.customers[0] : order?.customers;
        return {
          holder_id: h.id,
          name: h.name,
          phone: `${h.country_code || ''}${h.phone || ''}`,
          id_number: h.id_number,
          ticket_type: h.ticket_type,
          is_present: h.is_present,
          confirmed_at: h.confirmed_at,
          confirmed_by_name: h.confirmed_by_name,
          booking_reference: order?.booking_reference,
          payment_status: order?.payment_status,
          payment_method: order?.payment_method,
          customer_name: cust?.name || 'غير معروف',
          customer_phone: cust?.phone || '',
          customer_email: cust?.email || '',
          event_title: ev?.title || '',
          event_date: ev?.event_date || '',
          is_today: ev?.event_date ? isEventDateToday(ev.event_date) : false,
        };
      });

      return new Response(JSON.stringify({ success: true, results }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Manual mode: mark a specific ticket holder as present (found via search)
    if (mode === 'manual') {
      if (!holder_id) {
        return new Response(JSON.stringify({ success: false, message: 'التذكرة غير محددة' }), {
          status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const { data: holder, error: holderFetchError } = await supabase
        .from('ticket_holders')
        .select(HOLDER_SELECT)
        .eq('id', holder_id)
        .maybeSingle();

      if (holderFetchError || !holder) {
        return new Response(JSON.stringify({ success: false, message: 'تذكرة غير موجودة' }), {
          status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const order: any = Array.isArray((holder as any).orders) ? (holder as any).orders[0] : (holder as any).orders;
      const ev = Array.isArray(order?.events) ? order.events[0] : order?.events;
      const eventDate = ev?.event_date;
      const prettyDate = eventDate
        ? new Date(eventDate).toLocaleDateString('ar-u-nu-latn', { year: 'numeric', month: 'long', day: 'numeric' })
        : '';

      if (eventDate && isEventExpired(eventDate)) {
        return new Response(JSON.stringify({ success: false, message: `⏰ انتهت صلاحية التذكرة - الحدث انتهى في ${prettyDate}` }), {
          status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }
      if ((holder as any).is_present) {
        return new Response(JSON.stringify({ success: false, message: 'تم تسجيل حضور هذه التذكرة مسبقاً', already: true }), {
          status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const isPOS = order?.booking_reference?.startsWith('POS-') || order?.payment_method === 'cash_pos';
      const effectiveStatus = isPOS ? 'confirmed' : order?.payment_status;
      if (effectiveStatus !== 'confirmed') {
        return new Response(JSON.stringify({ success: false, message: '⚠️ الدفع غير مؤكد - لا يمكن تسجيل الحضور' }), {
          status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      const nowIso = new Date().toISOString();
      const patch: any = { is_present: true, confirmed_at: nowIso };
      if (admin_id) patch.confirmed_by = admin_id;
      if (staff_name) patch.confirmed_by_name = staff_name;

      const { error: manualUpdateError } = await supabase
        .from('ticket_holders')
        .update(patch)
        .eq('id', holder_id)
        .eq('is_present', false);

      if (manualUpdateError) {
        console.error('[Ticket Check-in] Manual update failed:', manualUpdateError);
        return new Response(JSON.stringify({ success: false, message: 'تعذر تسجيل الحضور، حاول مرة أخرى' }), {
          status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      }

      if (order && !order.n8n_responded_at) {
        await supabase
          .from('orders')
          .update({ n8n_response_message: 'تم التسجيل يدوياً ✓', n8n_responded_at: nowIso })
          .eq('id', order.id);
      }

      return new Response(JSON.stringify({
        success: true,
        message: `✅ تم تسجيل حضور ${(holder as any).name}`,
        confirmed_at: nowIso,
      }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

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

      if (staff_name) {
        updateData.confirmed_by_name = staff_name;
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