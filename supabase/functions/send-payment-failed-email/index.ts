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

const BANK_HINTS = [
  'card', 'بطاقة', 'declin', 'مرفوض', 'insufficient', 'رصيد', 'bank', 'بنك',
  'issuer', 'cvv', 'authorization', 'تفويض', 'منتهية',
]

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
  )

  let orderId: string | null = null
  let bookingRef: string | null = null
  let recipient: string | null = null

  const logEvent = async (status: string, detail?: string) => {
    try {
      await supabase.from('email_delivery_events').insert({
        order_id: orderId,
        booking_reference: bookingRef,
        recipient,
        template: 'payment-failed',
        status,
        attempt: 1,
        detail: detail ?? null,
      })
    } catch (e) {
      console.error('failed to log email event:', e)
    }
  }

  try {
    const body = await req.json().catch(() => ({}))
    const order_id: string | undefined = body?.order_id
    const booking_reference: string | undefined = body?.booking_reference
    if (!order_id && !booking_reference) {
      return json({ error: 'order_id or booking_reference is required' }, 400)
    }

    let query = supabase
      .from('orders')
      .select(
        'id, booking_reference, payment_status, payment_id, quantity, total_amount, payment_error_reason, customers(name, email, phone, country_code), events(title, event_date)',
      )
    query = order_id ? query.eq('id', order_id) : query.eq('booking_reference', booking_reference!)

    const { data: order, error } = await query.maybeSingle()
    if (error) throw error
    if (!order) return json({ error: 'order_not_found' }, 404)

    orderId = order.id
    bookingRef = order.booking_reference

    if (order.payment_status === 'confirmed') {
      return json({ sent: false, reason: 'order_confirmed' })
    }

    const customer = order.customers as
      | { name?: string; email?: string; phone?: string; country_code?: string }
      | null
    const email = (customer?.email || '').trim()
    if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      await logEvent('failed', 'لا يوجد بريد إلكتروني صالح للعميل')
      return json({ sent: false, reason: 'no_email' })
    }
    recipient = email

    // Only one failure notice per order.
    const { count } = await supabase
      .from('email_delivery_events')
      .select('id', { count: 'exact', head: true })
      .eq('order_id', order.id)
      .eq('template', 'payment-failed')
      .eq('status', 'sent')
    if ((count ?? 0) > 0 && !body?.force) {
      return json({ sent: false, reason: 'already_sent' })
    }

    await logEvent('queued', 'تمت جدولة إشعار فشل الدفع')

    const { data: settings } = await supabase
      .from('settings')
      .select('logo_url')
      .maybeSingle()

    const event = order.events as { title?: string; event_date?: string } | null
    const reason = (order.payment_error_reason || body?.error_message || '') as string
    const isBank = BANK_HINTS.some((h) => reason.toLowerCase().includes(h))

    let result: { sent: boolean; reason?: string }
    try {
      result = await sendTemplateEmail('payment-failed', email, {
        idempotencyKey: `payment-failed-${order.id}`,
        templateData: {
          booking_reference: order.booking_reference,
          customer_name: customer?.name || '-',
          customer_phone: `${customer?.country_code || ''}${customer?.phone || ''}`,
          event_title: event?.title || '-',
          event_date: event?.event_date || null,
          quantity: order.quantity,
          total_amount: order.total_amount,
          payment_id: order.payment_id,
          error_message: reason || null,
          error_source_label: isBank ? 'البنك / البطاقة' : 'بوابة الدفع سداد',
          logo_url: settings?.logo_url || null,
          retry_url: SITE_URL,
          invoice_url: `${SITE_URL}/invoice/${encodeURIComponent(order.booking_reference)}`,
        },
      })
    } catch (sendError) {
      const message = sendError instanceof Error ? sendError.message : 'unknown_error'
      await logEvent('failed', message)
      throw sendError
    }

    if (result?.sent) {
      await logEvent('sent', `تم الإرسال إلى ${email}`)
    } else {
      await logEvent(
        result?.reason === 'recipient_suppressed' ? 'suppressed' : 'failed',
        result?.reason || 'unknown',
      )
    }

    return json(result)
  } catch (e) {
    console.error('send-payment-failed-email failed:', e)
    return json({ error: e instanceof Error ? e.message : 'unknown_error' }, 500)
  }
})
