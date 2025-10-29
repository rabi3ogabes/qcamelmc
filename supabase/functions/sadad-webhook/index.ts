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

    console.log('=== SADAD WEBHOOK RECEIVED ===');
    console.log('Content-Type:', req.headers.get('content-type'));
    
    // Parse the incoming webhook data (Sadad sends as form data)
    let webhookData: any = {};
    const contentType = req.headers.get('content-type') || '';
    
    if (contentType.includes('application/x-www-form-urlencoded')) {
      const formData = await req.formData();
      for (const [key, value] of formData.entries()) {
        webhookData[key] = value;
      }
      console.log('Parsed form data:', JSON.stringify(webhookData, null, 2));
    } else {
      webhookData = await req.json();
      console.log('Parsed JSON data:', JSON.stringify(webhookData, null, 2));
    }

    // Extract relevant data (Sadad uses different field names in callbacks)
    const websiteRefNo = webhookData.ORDERID || webhookData.ORDER_ID || webhookData.websiteRefNo;
    const transactionNumber = webhookData.TXNID || webhookData.transactionNumber;
    const transactionStatus = webhookData.STATUS || webhookData.RESPCODE || webhookData.transactionStatus;
    const merchantId = webhookData.MID || webhookData.merchant_id || webhookData.merchantId;
    const message = webhookData.RESPMSG || webhookData.message;
    const txnAmount = webhookData.TXNAMOUNT || webhookData.txnAmount;
    const checksumhash = webhookData.CHECKSUMHASH || webhookData.checksumhash;
    const isTestMode = webhookData.isTestMode || webhookData.TESTMODE;

    console.log('Extracted data:', {
      websiteRefNo,
      transactionNumber,
      transactionStatus,
      merchantId,
      message,
      txnAmount
    });

    if (!websiteRefNo) {
      console.error('Missing order ID in webhook data');
      return new Response(
        JSON.stringify({ error: 'Missing order ID' }),
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
    // Sadad uses: '1' or 1 for success, '0' or other codes for failure
    const isSuccess = transactionStatus === 'TXN_SUCCESS' || transactionStatus === '1' || transactionStatus === 1 || transactionStatus === 3;
    const paymentStatus = isSuccess ? 'confirmed' : 'failed';
    
    console.log(`Payment status determined: ${paymentStatus} (from status: ${transactionStatus})`);
    
    const { error: updateError } = await supabase
      .from('orders')
      .update({
        payment_status: paymentStatus,
        payment_id: transactionNumber || null,
        confirmed_at: paymentStatus === 'confirmed' ? new Date().toISOString() : null
      })
      .eq('booking_reference', websiteRefNo)

    if (updateError) {
      console.error('Error updating order:', updateError)
      throw updateError
    }

    console.log(`Order ${websiteRefNo} updated to ${paymentStatus}`)

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

    console.log('Webhook processing completed successfully');

    // Redirect user to callback page with order details
    const redirectUrl = `https://qcamelmc.org/sadad-callback?status=${isSuccess ? 'success' : 'failed'}&orderId=${websiteRefNo}`;
    
    return new Response(null, {
      status: 302,
      headers: {
        ...corsHeaders,
        'Location': redirectUrl
      }
    });

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
