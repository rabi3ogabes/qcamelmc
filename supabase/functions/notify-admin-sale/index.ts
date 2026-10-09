import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.58.0'
import { sendTemplateEmail } from '../_shared/transactional-email-templates/send-email.ts'
import { isAdminAuthorized, isServiceRoleCall } from '../_shared/staffAuth.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const SITE_URL = 'https://qcamelmc.org'

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  // Internal: another edge function (service role) or a signed-in administrator. Never anonymous.
  if (!isServiceRoleCall(req) && !(await isAdminAuthorized(req, supabase))) {
    return json({ error: 'unauthorized' }, 401)
  }

  let orderId: string | null = null
  let bookingRef: string | null = null
  let adminEmail = ''

  const logEvent = async (status: string, detail?: string) => {
    try {
      await supabase.from('email_delivery_events').insert({
        order_id: orderId,
        booking_reference: bookingRef,
        recipient: adminEmail || null,
        template: 'admin-sale-alert',
        status,
        attempt: 1,
        detail: detail ?? null,
      })
    } catch (e) {
      console.error('failed to log admin sale event:', e)
    }
  }

  try {
    const body = await req.json().catch(() => ({}))
    const order_id: string | undefined = body?.order_id
    const booking_reference: string | undefined = body?.booking_reference
    const force: boolean = !!body?.force

    if (!order_id && !booking_reference) {
      return json({ error: 'order_id or booking_reference is required' }, 400)
    }

    let query = supabase
      .from('orders')
      .select(
        'id, booking_reference, payment_status, payment_method, payment_id, confirmed_at, created_at, quantity, total_amount, customers(name, email, phone, country_code), events(title, event_date), ticket_holders(name, ticket_type)',
      )
    query = order_id ? query.eq('id', order_id) : query.eq('booking_reference', booking_reference!)

    const { data: order, error } = await query.maybeSingle()
    if (error) throw error
    if (!order) return json({ error: 'order_not_found' }, 404)

    orderId = order.id
    bookingRef = order.booking_reference

    if (order.payment_status !== 'confirmed') {
      return json({ sent: false, reason: 'not_confirmed' })
    }

    const { data: settings } = await supabase
      .from('settings')
      .select('logo_url, admin_email')
      .maybeSingle()

    adminEmail = (settings?.admin_email || '').trim()
    if (!adminEmail || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(adminEmail)) {
      return json({ sent: false, reason: 'no_admin_email' })
    }

    // One alert per order.
    if (!force) {
      const { count } = await supabase
        .from('email_delivery_events')
        .select('id', { count: 'exact', head: true })
        .eq('order_id', order.id)
        .eq('template', 'admin-sale-alert')
        .eq('status', 'sent')
      if ((count ?? 0) > 0) return json({ sent: false, reason: 'already_sent' })
    }

    const customer = order.customers as
      | { name?: string; email?: string; phone?: string; country_code?: string }
      | null
    const event = order.events as { title?: string; event_date?: string } | null
    const holders = (order.ticket_holders || []) as Array<{ name?: string; ticket_type?: string }>

    const typeLabel = (t?: string) =>
      t === 'vip' ? 'VIP' : t === 'parking' ? 'مواقف' : 'عادي'

    const templateData = {
      booking_reference: order.booking_reference,
      customer_name: customer?.name || '-',
      customer_phone: `${customer?.country_code || ''}${customer?.phone || ''}`,
      customer_email: customer?.email || null,
      event_title: event?.title || '-',
      event_date: event?.event_date || null,
      quantity: order.quantity,
      total_amount: order.total_amount,
      payment_id: order.payment_id,
      payment_method: order.payment_method,
      source_label:
        order.payment_method === 'cash_pos' ? 'بيع عبر نقاط البيع' : 'دفع إلكتروني (سداد)',
      sold_at: order.confirmed_at || order.created_at,
      logo_url: settings?.logo_url || null,
      invoice_url: `${SITE_URL}/invoice/${encodeURIComponent(order.booking_reference)}`,
      holders_summary:
        holders.length > 0
          ? holders.map((h) => `${h.name || '-'} (${typeLabel(h.ticket_type)})`).join('، ')
          : null,
    }

    await logEvent('queued', 'تمت جدولة إشعار البيع للأدمن')

    let result: { sent: boolean; reason?: string }
    try {
      result = await sendTemplateEmail('admin-sale-alert', adminEmail, {
        idempotencyKey: `admin-sale-${order.id}`,
        templateData,
      })
    } catch (sendError) {
      const message = sendError instanceof Error ? sendError.message : 'unknown_error'
      await logEvent('failed', message)
      throw sendError
    }

    await logEvent(
      result?.sent ? 'sent' : result?.reason === 'recipient_suppressed' ? 'suppressed' : 'failed',
      result?.sent ? `تم الإرسال إلى ${adminEmail}` : result?.reason || 'unknown',
    )

    return json(result)
  } catch (e) {
    console.error('notify-admin-sale failed:', e)
    return json({ error: e instanceof Error ? e.message : 'unknown_error' }, 500)
  }
})
