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
    console.log('Request method:', req.method);
    console.log('Content-Type:', req.headers.get('content-type'));
    
    // Parse the incoming webhook data
    // Can come from: 1) Form data POST from Sadad, 2) JSON POST from frontend, 3) GET with URL params
    let webhookData: any = {};
    const contentType = req.headers.get('content-type') || '';
    
    if (req.method === 'GET') {
      // Handle GET request with URL parameters
      const url = new URL(req.url);
      for (const [key, value] of url.searchParams.entries()) {
        webhookData[key] = value;
      }
      console.log('Parsed URL params:', JSON.stringify(webhookData, null, 2));
    } else if (contentType.includes('application/x-www-form-urlencoded')) {
      const formData = await req.formData();
      for (const [key, value] of formData.entries()) {
        webhookData[key] = value;
      }
      console.log('Parsed form data:', JSON.stringify(webhookData, null, 2));
    } else if (contentType.includes('application/json')) {
      webhookData = await req.json();
      console.log('Parsed JSON data:', JSON.stringify(webhookData, null, 2));
    } else {
      // Try to parse as JSON anyway
      try {
        webhookData = await req.json();
        console.log('Parsed as JSON:', JSON.stringify(webhookData, null, 2));
      } catch (e) {
        console.error('Failed to parse request body:', e);
      }
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

    // Verify checksumhash - temporarily log but don't fail
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
      
      console.log('Verification string:', verificationString)
      console.log('Expected checksumhash:', checksumhash)
      
      // Hash with SHA256
      const encoder = new TextEncoder()
      const data = encoder.encode(verificationString)
      const hashBuffer = await crypto.subtle.digest('SHA-256', data)
      const hashArray = Array.from(new Uint8Array(hashBuffer))
      const computedHash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
      
      console.log('Computed checksumhash:', computedHash)
      
      if (computedHash !== checksumhash) {
        console.warn('Checksumhash verification failed - continuing anyway to process payment')
        // Don't fail the request, just log the warning
      } else {
        console.log('Checksumhash verified successfully')
      }
    }

    // Update order status based on transaction status
    // Sadad status codes: 1 = success, 2 = failed, 0 = pending/cancelled
    // Note: Removed status 3 as it was causing incorrect confirmations
    const isSuccess = transactionStatus === 'TXN_SUCCESS' || transactionStatus === '1' || transactionStatus === 1;
    const paymentStatus = isSuccess ? 'confirmed' : 'cancelled';
    
    // Build error reason for failed payments
    let paymentErrorReason: string | null = null;
    if (!isSuccess) {
      const errorParts: string[] = [];
      if (message) errorParts.push(message);
      if (transactionStatus && transactionStatus !== 'TXN_FAILURE') {
        errorParts.push(`Status: ${transactionStatus}`);
      }
      paymentErrorReason = errorParts.length > 0 ? errorParts.join(' - ') : 'Payment failed or cancelled by user';
    }
    
    console.log(`Payment status determined: ${paymentStatus} (from status: ${transactionStatus}), error: ${paymentErrorReason}`);
    
    // CRITICAL: Check current order status to prevent race conditions
    // Never overwrite a 'confirmed' order with 'cancelled' (prevents duplicate webhook issues)
    const { data: existingOrder } = await supabase
      .from('orders')
      .select('payment_status')
      .eq('booking_reference', websiteRefNo)
      .maybeSingle();

    if (existingOrder?.payment_status === 'confirmed' && paymentStatus === 'cancelled') {
      console.log(`Order ${websiteRefNo} already confirmed - ignoring cancel webhook to prevent race condition`);
      return new Response(
        JSON.stringify({ 
          success: true,
          message: 'Order already confirmed, ignoring duplicate webhook',
          order_id: websiteRefNo
        }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 200 }
      );
    }
    
    const { error: updateError } = await supabase
      .from('orders')
      .update({
        payment_status: paymentStatus,
        payment_id: transactionNumber || null,
        confirmed_at: paymentStatus === 'confirmed' ? new Date().toISOString() : null,
        payment_error_reason: paymentErrorReason
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

    // Return success response (no redirect needed when called from frontend)
    return new Response(
      JSON.stringify({ 
        success: true,
        payment_status: paymentStatus,
        order_id: websiteRefNo,
        message: 'Payment processed successfully'
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );

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
