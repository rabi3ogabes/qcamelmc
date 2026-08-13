import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.58.0'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

// Posts the checkout payload to the configured n8n webhook.
// The webhook URL and admin phone stay server-side (never exposed to the browser).
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
    )

    const body = await req.json()
    const bookingReference: string | undefined = body?.bookingReference

    if (!bookingReference || typeof bookingReference !== 'string') {
      return new Response(JSON.stringify({ error: 'bookingReference is required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const { data: settings } = await supabase
      .from('settings')
      .select('webhook_url, admin_phone')
      .maybeSingle()

    if (!settings?.webhook_url) {
      return new Response(JSON.stringify({ skipped: true, reason: 'webhook_url not configured' }), {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const formatPhone = (phone: string | null | undefined) => {
      if (!phone) return null
      const clean = String(phone).replace(/[+\s]/g, '')
      return clean.startsWith('974') ? clean : `974${clean}`
    }

    // Re-read the order server-side so the payload cannot be forged from the client.
    const { data: order } = await supabase
      .from('orders')
      .select('*, customers(*), ticket_holders(*)')
      .eq('booking_reference', bookingReference)
      .maybeSingle()

    if (!order) {
      return new Response(JSON.stringify({ error: 'Order not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const { customers, ticket_holders, ...orderRow } = order as Record<string, unknown> & {
      customers: Record<string, unknown>
      ticket_holders: Array<Record<string, unknown>>
    }

    const payload = {
      customer: { ...customers, phone: formatPhone(customers?.phone as string) },
      order: orderRow,
      ticketHolders: (ticket_holders || []).map((h) => ({
        ...h,
        phone: formatPhone(h.phone as string),
      })),
      bookingReference,
      adminPhone: formatPhone(settings.admin_phone),
      timestamp: new Date().toISOString(),
    }

    const res = await fetch(settings.webhook_url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    })

    return new Response(JSON.stringify({ success: res.ok, status: res.status }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  } catch (error) {
    console.error('checkout-webhook error:', error)
    return new Response(JSON.stringify({ error: String(error) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
