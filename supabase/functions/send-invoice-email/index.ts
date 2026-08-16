import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.58.0'
import { sendTemplateEmail } from '../_shared/transactional-email-templates/send-email.ts'

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

  let orderId: string | null = null
  let bookingRef: string | null = null
  let recipient: string | null = null
  let attempt = 1

  const logEvent = async (status: string, detail?: string) => {
    try {
      await supabase.from('email_delivery_events').insert({
        order_id: orderId,
        booking_reference: bookingRef,
        recipient,
        template: 'booking-invoice',
        status,
        attempt,
        detail: detail ?? null,
      })
    } catch (e) {
      console.error('failed to log email event:', e)
    }
  }

  try {
    const { order_id, force } = await req.json().catch(() => ({}))
    if (!order_id || typeof order_id !== 'string') {
      return json({ error: 'order_id is required' }, 400)
    }
    orderId = order_id

    const { data: order, error } = await supabase
      .from('orders')
      .select(
        'id, booking_reference, payment_status, payment_method, payment_id, confirmed_at, ticket_type, quantity, total_amount, invoice_email_sent_at, customers(name, email, phone, country_code), events(title, event_date)',
      )
      .eq('id', order_id)
      .maybeSingle()

    if (error) throw error
    if (!order) return json({ error: 'order_not_found' }, 404)

    bookingRef = order.booking_reference

    // Only confirmed orders get an invoice.
    if (order.payment_status !== 'confirmed') {
      return json({ sent: false, reason: 'not_confirmed' })
    }

    const customer = order.customers as { name?: string; email?: string; phone?: string; country_code?: string } | null
    const email = (customer?.email || '').trim()
    if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      await logEvent('failed', 'لا يوجد بريد إلكتروني صالح للعميل')
      return json({ sent: false, reason: 'no_email' })
    }
    recipient = email

    if (order.invoice_email_sent_at && !force) {
      return json({ sent: false, reason: 'already_sent' })
    }

    // Attempt number = previous queued attempts + 1
    const { count } = await supabase
      .from('email_delivery_events')
      .select('id', { count: 'exact', head: true })
      .eq('order_id', order.id)
      .in('status', ['queued', 'retried'])
    attempt = (count ?? 0) + 1

    await logEvent(
      attempt > 1 ? 'retried' : 'queued',
      attempt > 1 ? `إعادة إرسال — المحاولة رقم ${attempt}` : 'تمت جدولة الإرسال',
    )

    const { data: settings } = await supabase
      .from('settings')
      .select('logo_url')
      .maybeSingle()

    const event = order.events as { title?: string; event_date?: string } | null
    const invoiceUrl = `${SITE_URL}/invoice/${encodeURIComponent(order.booking_reference)}`

    let result: { sent: boolean; reason?: string }
    try {
      result = await sendTemplateEmail('booking-invoice', email, {
        idempotencyKey: `booking-invoice-${order.id}-${attempt}`,
        templateData: {
          booking_reference: order.booking_reference,
          customer_name: customer?.name || '-',
          customer_phone: `${customer?.country_code || ''}${customer?.phone || ''}`,
          event_title: event?.title || '-',
          event_date: event?.event_date || null,
          ticket_type: order.ticket_type,
          quantity: order.quantity,
          total_amount: order.total_amount,
          payment_id: order.payment_id,
          payment_method: order.payment_method,
          paid_at: order.confirmed_at,
          logo_url: settings?.logo_url || null,
          invoice_url: invoiceUrl,
        },
      })
    } catch (sendError) {
      const message = sendError instanceof Error ? sendError.message : 'unknown_error'
      await logEvent('failed', message)
      throw sendError
    }

    if (result?.sent) {
      await logEvent('sent', `تم الإرسال إلى ${email}`)
      await supabase
        .from('orders')
        .update({ invoice_email_sent_at: new Date().toISOString() })
        .eq('id', order.id)
    } else {
      await logEvent(result?.reason === 'recipient_suppressed' ? 'suppressed' : 'failed', result?.reason || 'unknown')
    }

    return json({ ...result, invoice_url: invoiceUrl, attempt })
  } catch (e) {
    console.error('send-invoice-email failed:', e)
    return json({ error: e instanceof Error ? e.message : 'unknown_error' }, 500)
  }
})
