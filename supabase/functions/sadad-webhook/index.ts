import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.58.0'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const supabaseUrl = Deno.env.get('SUPABASE_URL')!
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(supabaseUrl, supabaseServiceKey)

    // Get the webhook data from Sadad
    const formData = await req.formData()
    const webhookData: Record<string, string> = {}
    
    for (const [key, value] of formData.entries()) {
      webhookData[key] = value.toString()
    }

    console.log('Sadad Webhook received:', webhookData)

    const {
      ORDER_ID,
      RESPCODE,
      RESPMSG,
      TXNID,
      TXNAMOUNT,
      CHECKSUMHASH
    } = webhookData

    if (!ORDER_ID) {
      console.error('Missing ORDER_ID in webhook')
      return new Response(
        JSON.stringify({ error: 'Missing ORDER_ID' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Update order status based on response code
    const paymentStatus = RESPCODE === '00' ? 'completed' : 'failed'

    const { error: updateError } = await supabase
      .from('orders')
      .update({
        payment_status: paymentStatus,
        payment_id: TXNID || null,
      })
      .eq('booking_reference', ORDER_ID)

    if (updateError) {
      console.error('Error updating order:', updateError)
      throw updateError
    }

    console.log(`Order ${ORDER_ID} updated to ${paymentStatus}`)

    // Get settings to call n8n webhook if configured
    const { data: settings } = await supabase
      .from('settings')
      .select('webhook_url')
      .maybeSingle()

    if (settings?.webhook_url) {
      try {
        // Get order details to send to n8n
        const { data: order } = await supabase
          .from('orders')
          .select(`
            *,
            customers (*),
            events (*)
          `)
          .eq('booking_reference', ORDER_ID)
          .single()

        if (order) {
          await fetch(settings.webhook_url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              order,
              sadad_response: webhookData,
              timestamp: new Date().toISOString()
            })
          })
          console.log('n8n webhook called successfully')
        }
      } catch (webhookError) {
        console.error('Error calling n8n webhook:', webhookError)
        // Don't fail the main webhook if n8n call fails
      }
    }

    return new Response(
      JSON.stringify({ success: true }),
      { 
        status: 200, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )

  } catch (error) {
    console.error('Webhook error:', error)
    const errorMessage = error instanceof Error ? error.message : 'Unknown error'
    return new Response(
      JSON.stringify({ error: errorMessage }),
      { 
        status: 500, 
        headers: { ...corsHeaders, 'Content-Type': 'application/json' } 
      }
    )
  }
})
