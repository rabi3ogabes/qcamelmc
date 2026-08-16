import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.58.0'
import { sendTemplateEmail } from '../_shared/transactional-email-templates/send-email.ts'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })

  try {
    const { order_id } = await req.json().catch(() => ({}))
    if (!order_id || typeof order_id !== 'string') {
      return json({ error: 'order_id is required' }, 400)
    }

    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    const { data: order, error } = await supabase
      .from('orders')
      .select(
        'id, booking_reference, payment_status, payment_method, payment_id, confirmed_at, ticket_type, quantity, total_amount, invoice_email_sent_at, customers(name, email, phone, country_code), events(title, event_date)',
      )
      .eq('id', order_id)
      .maybeSingle()

    if (error) throw error
    if (!order) return json({ error: 'order_not_found' }, 404)

    // Only confirmed orders get an invoice.
    if (order.payment_status !== 'confirmed') {
      return json({ sent: false, reason: 'not_confirmed' })
    }

    const customer = order.customers as { name?: string; email?: string; phone?: string; country_code?: string } | null
    const email = (customer?.email || '').trim()
    if (!email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) {
      return json({ sent: false, reason: 'no_email' })
    }

    if (order.invoice_email_sent_at) {
      return json({ sent: false, reason: 'already_sent' })
    }

    const { data: settings } = await supabase
      .from('settings')
      .select('logo_url')
      .maybeSingle()

    const event = order.events as { title?: string; event_date?: string } | null

    const result = await sendTemplateEmail('booking-invoice', email, {
      idempotencyKey: `booking-invoice-${order.id}`,
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
      },
    })

    await supabase
      .from('orders')
      .update({ invoice_email_sent_at: new Date().toISOString() })
      .eq('id', order.id)

    return json(result)
  } catch (e) {
    console.error('send-invoice-email failed:', e)
    return json({ error: e instanceof Error ? e.message : 'unknown_error' }, 500)
  }
})
