import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Signature generation function based on Sadad's new documentation
// This replaces the deprecated checksumhash method
async function generateSignature(paymentData: any, secretKey: string): Promise<string> {
  // Exclude productdetail from signature calculation as per Sadad docs
  const { productdetail, ...dataForSignature } = paymentData;
  
  // Sort parameter names alphabetically
  const sortedKeys = Object.keys(dataForSignature).sort();
  
  // Build signature string: secretKey + concatenated values (no separators)
  let signatureString = secretKey;
  for (const key of sortedKeys) {
    signatureString += dataForSignature[key];
  }
  
  // Hash with SHA-256
  const hashBuffer = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(signatureString)
  );
  
  // Convert to hex string
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const signature = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  
  return signature;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    // Settings holds Sadad credentials which are not readable by the anon role.
    // Read them with the service-role client (server-side only, never returned to the client).
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '',
      { auth: { persistSession: false } }
    );

    const parsedBody = await req.json();
    const { orderId, orderData } = parsedBody;
    failureContext = { orderId, orderData, client: supabaseClient };

    // Fetch Sadad settings
    const { data: settings, error: settingsError } = await supabaseClient
      .from('settings')
      .select('sadad_merchant_id, sadad_secret, sadad_website_domain, webhook_url')
      .single();

    if (settingsError || !settings) {
      throw new Error('Sadad settings not configured');
    }

    if (!settings.sadad_merchant_id || !settings.sadad_secret) {
      throw new Error('Sadad credentials missing');
    }

    // Prepare payment data
    const txnDate = new Date().toISOString().replace('T', ' ').substring(0, 19);
    
    // Payment data - parameter names are CASE-SENSITIVE per Sadad docs
    // CRITICAL: WEBSITE must match EXACTLY what's registered in Sadad merchant panel when generating secret key
    const websiteDomain = settings.sadad_website_domain || 'qcamelmc.org';
    
    // CRITICAL: CALLBACK_URL must be on the registered domain (qcamelmc.org)
    // Sadad will redirect the user here with payment data as URL parameters
    const callbackUrl = `https://${websiteDomain}/sadad-callback`;
    
    console.log('=== SADAD REQUEST CONFIGURATION ===');
    console.log('Website Domain (from settings):', websiteDomain);
    console.log('Callback URL:', callbackUrl);
    console.log('Merchant ID:', settings.sadad_merchant_id);
    console.log('=== END CONFIGURATION ===');
    
    // IMPORTANT: Validate that required settings are configured correctly
    if (!settings.sadad_merchant_id || settings.sadad_merchant_id !== '1664851') {
      throw new Error(`Invalid Merchant ID. Expected: 1664851, Got: ${settings.sadad_merchant_id}`);
    }
    
    if (!websiteDomain) {
      throw new Error('WEBSITE domain not configured in settings.sadad_website_domain');
    }
    
    // Build payment data for Direct Payment API (standard web checkout)
    const paymentData = {
      merchant_id: settings.sadad_merchant_id,
      ORDER_ID: orderId,
      WEBSITE: websiteDomain,
      TXN_AMOUNT: orderData.total_amount.toFixed(2),
      CUST_ID: orderData.customer_email || orderData.customer_phone,
      EMAIL: orderData.customer_email || 'noemail@example.com',
      MOBILE_NO: orderData.customer_phone.replace(/[^0-9]/g, ''),
      SADAD_WEBCHECKOUT_PAGE_LANGUAGE: 'Arb',
      CALLBACK_URL: callbackUrl,
      txnDate: txnDate,
      productdetail: orderData.items.map((item: any) => ({
        order_id: orderId,
        itemname: item.name,
        amount: item.price.toFixed(2),
        quantity: item.quantity.toString(),
        type: 'line_item'
      }))
    };

    // Generate signature using new Sadad method (replaces deprecated checksumhash)
    // Method: Sort params alphabetically (exclude productdetail), concatenate values with secret key, SHA-256 hash
    const signature = await generateSignature(paymentData, settings.sadad_secret);

    // Enhanced logging for debugging - Based on official Sadad documentation
    console.log('=== SADAD SIGNATURE GENERATION DEBUG (SHA-256 Method) ===');
    console.log('Order ID:', orderId);
    console.log('Merchant ID:', settings.sadad_merchant_id);
    console.log('Website Domain:', websiteDomain);
    console.log('Payment Amount:', orderData.total_amount.toFixed(2));
    console.log('Secret Key (first 4 chars):', settings.sadad_secret.substring(0, 4) + '***');
    console.log('Secret Key Length:', settings.sadad_secret.length);
    
    // Show sorted parameters for signature (excluding productdetail)
    const { productdetail: _, ...paramsForSignature } = paymentData;
    const sortedKeys = Object.keys(paramsForSignature).sort();
    console.log('Sorted Parameter Keys (for signature):', sortedKeys);
    
    // Show signature string composition (first 100 chars)
    let debugSignatureString = settings.sadad_secret;
    for (const key of sortedKeys) {
      debugSignatureString += (paramsForSignature as any)[key];
    }
    console.log('Signature String (first 100 chars):', debugSignatureString.substring(0, 100) + '...');
    console.log('Signature String Total Length:', debugSignatureString.length);
    console.log('Generated Signature (SHA-256):', signature);
    console.log('Signature Length:', signature.length);
    
    // Validation checks
    console.log('=== VALIDATION CHECKS ===');
    console.log('✓ Merchant ID:', settings.sadad_merchant_id);
    console.log('✓ Website Domain:', websiteDomain);
    console.log('✓ Secret Key Set:', !!settings.sadad_secret && settings.sadad_secret.length > 0);
    console.log('✓ Amount Format:', orderData.total_amount.toFixed(2));
    console.log('✓ Signature Method: SHA-256 (New Method - Checksumhash Deprecated)');
    console.log('⚠️  CRITICAL: Test Mode MUST be ENABLED in Sadad Panel → API section');
    console.log('⚠️  CRITICAL: Secret Key must be generated AFTER adding domain:', websiteDomain);
    console.log('⚠️  CRITICAL: Domain must match EXACTLY (no www, no https://)');
    console.log('=== END DEBUG ===');

    return new Response(
      JSON.stringify({ 
        success: true,
        paymentData: {
          ...paymentData,
          signature  // New signature parameter replaces checksumhash
        },
        sadadUrl: 'https://sadadqa.com/webpurchase'  // Direct Payment API URL (Official Sadad endpoint)
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );
  } catch (error) {
    console.error('Error in sadad-payment function:', error);

    // Record the failure so admins can track it from the dashboard
    try {
      if (failureContext?.client) {
        const od = failureContext.orderData ?? {};
        await failureContext.client.from('payment_errors').insert({
          booking_reference: failureContext.orderId ?? null,
          customer_name: od.customer_name ?? null,
          customer_phone: od.customer_phone ?? null,
          quantity: Array.isArray(od.items)
            ? od.items.reduce((sum: number, i: any) => sum + (Number(i.quantity) || 0), 0)
            : od.quantity ?? null,
          amount: od.total_amount ?? null,
          error_source: 'sadad',
          error_code: 'SADAD_INIT_FAILED',
          error_message: error instanceof Error ? error.message : 'Unknown error',
          raw: { source: 'sadad-payment' },
        });
      }
    } catch (logError) {
      console.error('Failed to record payment error:', logError);
    }

    return new Response(
      JSON.stringify({ 
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 400,
      }
    );
  }
});
