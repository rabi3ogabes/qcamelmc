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

    // Get the webhook data from Sadad (JSON format)
    const webhookData = await req.json()
    
    console.log('Sadad Webhook received:', webhookData)

    const {
      websiteRefNo,
      transactionStatus,
      transactionNumber,
      merchantId,
      message,
      txnAmount,
      isTestMode,
      checksumhash
    } = webhookData

    if (!websiteRefNo) {
      console.error('Missing websiteRefNo in webhook')
      return new Response(
        JSON.stringify({ error: 'Missing websiteRefNo' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Verify checksumhash
    const { data: settings } = await supabase
      .from('settings')
      .select('sadad_secret')
      .maybeSingle()

    if (settings?.sadad_secret && checksumhash) {
      // Create verification string: secretKey + sorted values (no separators)
      const dataToVerify: Record<string, any> = {
        isTestMode,
        merchantId,
        message,
        transactionNumber,
        transactionStatus,
        txnAmount,
        websiteRefNo
      }
      
      // Sort keys alphabetically and concatenate values
      const sortedKeys = Object.keys(dataToVerify).sort()
      const verificationString = settings.sadad_secret + sortedKeys.map(key => String(dataToVerify[key])).join('')
      
      // Hash with SHA256
      const encoder = new TextEncoder()
      const data = encoder.encode(verificationString)
      const hashBuffer = await crypto.subtle.digest('SHA-256', data)
      const hashArray = Array.from(new Uint8Array(hashBuffer))
      const computedHash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
      
      if (computedHash !== checksumhash) {
        console.error('Checksumhash verification failed')
        return new Response(
          JSON.stringify({ error: 'Invalid checksumhash' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }
      
      console.log('Checksumhash verified successfully')
    }

    // Update order status based on transaction status
    // transactionStatus: 1 = in progress, 2 = failed, 3 = success
    let paymentStatus: 'pending' | 'confirmed' | 'failed'
    if (transactionStatus === 3) {
      paymentStatus = 'confirmed'
    } else if (transactionStatus === 2) {
      paymentStatus = 'failed'
    } else {
      paymentStatus = 'pending'
    }

    const { error: updateError } = await supabase
      .from('orders')
      .update({
        payment_status: paymentStatus,
        payment_id: transactionNumber || null,
      })
      .eq('booking_reference', websiteRefNo)

    if (updateError) {
      console.error('Error updating order:', updateError)
      throw updateError
    }

    console.log(`Order ${websiteRefNo} updated to ${paymentStatus} (transactionStatus: ${transactionStatus})`)

    // Get webhook URL to call n8n if configured
    const { data: webhookSettings } = await supabase
      .from('settings')
      .select('webhook_url')
      .maybeSingle()

    if (webhookSettings?.webhook_url) {
      try {
        // Get order details with ticket holders to send to n8n
        const { data: order } = await supabase
          .from('orders')
          .select(`
            *,
            customers (*),
            events (*),
            ticket_holders (*)
          `)
          .eq('booking_reference', websiteRefNo)
          .single()

        // Fetch ticket prices
        const { data: tickets } = await supabase
          .from('tickets')
          .select('type, price')

        // Create a map of ticket type to price
        const ticketPrices = new Map(
          tickets?.map((ticket) => [ticket.type, ticket.price]) || []
        )

        if (order) {
          // Format ticket holders with prices
          const formattedHolders = (order.ticket_holders || []).map((holder: any) => ({
            name: holder.name,
            phone: holder.phone?.replace(/\s+/g, ''),
            country_code: holder.country_code?.replace('+', ''),
            nationality: holder.nationality,
            id_number: holder.id_number,
            ticket_type: holder.ticket_type,
            ticket_price: ticketPrices.get(holder.ticket_type) || 0,
            qr_code: holder.qr_code,
            is_present: holder.is_present
          }))

          await fetch(webhookSettings.webhook_url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              order: {
                ...order,
                ticket_holders: formattedHolders
              },
              customer: order.customers,
              event: order.events,
              payment_status: paymentStatus,
              sadad_webhook_data: webhookData,
              timestamp: new Date().toISOString()
            })
          })
          console.log('n8n webhook called successfully with ticket holders data')
        }
      } catch (webhookError) {
        console.error('Error calling n8n webhook:', webhookError)
        // Don't fail the main webhook if n8n call fails
      }
    }

    // Return required response format for Sadad
    return new Response(
      JSON.stringify({ status: 'success' }),
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
