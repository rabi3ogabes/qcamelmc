import { createEmailWebhookHandler } from 'npm:@lovable.dev/email-js@0.1.0'
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.58.0'

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
)

const record = async (event: any, status: string, detail: string) => {
  const recipient = (event?.data?.recipient || '').trim()

  // Dedupe on the delivery event id so redeliveries do not duplicate rows.
  const { data: existing } = await supabase
    .from('email_delivery_events')
    .select('id')
    .eq('detail', `${detail} [${event.event_id}]`)
    .maybeSingle()
  if (existing) return

  let orderId: string | null = null
  let bookingReference: string | null = null
  if (recipient) {
    const { data: last } = await supabase
      .from('email_delivery_events')
      .select('order_id, booking_reference')
      .ilike('recipient', recipient)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()
    orderId = last?.order_id ?? null
    bookingReference = last?.booking_reference ?? null
  }

  const { error } = await supabase.from('email_delivery_events').insert({
    order_id: orderId,
    booking_reference: bookingReference,
    recipient: recipient || null,
    template: 'booking-invoice',
    status,
    attempt: 1,
    detail: `${detail} [${event.event_id}]`,
  })
  if (error) throw error
}

const handler = createEmailWebhookHandler({
  apiKey: Deno.env.get('LOVABLE_API_KEY')!,
  on: {
    'email.bounced': async (event) => {
      await record(event, 'bounced', 'ارتد البريد ولم يصل للمستلم')
    },
    'email.complaint': async (event) => {
      await record(event, 'complained', 'صنّف المستلم الرسالة كإزعاج')
    },
    'email.unsubscribed': async (event) => {
      await record(event, 'unsubscribed', 'ألغى المستلم الاشتراك')
    },
  },
})

Deno.serve((req) => handler(req))
