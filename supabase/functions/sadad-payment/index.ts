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
    const supabaseClient = createClient(
      Deno.env.get('SUPABASE_URL') ?? '',
      Deno.env.get('SUPABASE_ANON_KEY') ?? '',
      {
        global: {
          headers: { Authorization: req.headers.get('Authorization')! },
        },
      }
    );

    const { orderId, orderData } = await req.json();

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
    
    // CRITICAL: CALLBACK_URL must use the actual request origin where the payment was initiated
    // This is required for Sadad's security validation
    const requestOrigin = req.headers.get('origin') || 'https://qcamelmc.org';
    const callbackUrl = `${requestOrigin}/sadad-callback`;
    
    // Payment data - parameter names are CASE-SENSITIVE per Sadad docs
    // CRITICAL: WEBSITE must match EXACTLY what's registered in Sadad merchant panel when generating secret key
    const websiteDomain = settings.sadad_website_domain || 'qcamelmc.org';
    
    console.log('=== SADAD REQUEST CONFIGURATION ===');
    console.log('Request Origin:', requestOrigin);
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

    // Enhanced logging for debugging
    console.log('=== SADAD PAYMENT REQUEST DEBUG (NEW SIGNATURE METHOD) ===');
    console.log('Order ID:', orderId);
    console.log('Merchant ID:', settings.sadad_merchant_id);
    console.log('Website Domain:', websiteDomain);
    console.log('Payment Amount:', orderData.total_amount.toFixed(2));
    console.log('Secret Key (first 4 chars):', settings.sadad_secret.substring(0, 4) + '***');
    console.log('Secret Key Length:', settings.sadad_secret.length);
    console.log('Full Payment Data:', JSON.stringify(paymentData, null, 2));
    console.log('Generated Signature (SHA-256):', signature);
    console.log('Signature Length:', signature.length);
    
    // Validation warnings
    console.log('=== VALIDATION CHECKS ===');
    console.log('✓ Merchant ID matches:', settings.sadad_merchant_id === '1664851');
    console.log('✓ Website domain is set:', !!websiteDomain);
    console.log('✓ Secret key is set:', !!settings.sadad_secret && settings.sadad_secret.length > 0);
    console.log('✓ Amount format is correct:', /^\d+\.\d{2}$/.test(orderData.total_amount.toFixed(2)));
    console.log('✓ Using NEW Signature Method (SHA-256) - Checksumhash deprecated');
    console.log('⚠️  CRITICAL: Ensure Test Mode is ENABLED in Sadad Merchant Panel → API section');
    console.log('⚠️  CRITICAL: Verify the secret key was generated for domain:', websiteDomain);
    console.log('=== END DEBUG ===');

    return new Response(
      JSON.stringify({ 
        success: true,
        paymentData: {
          ...paymentData,
          signature  // New signature parameter replaces checksumhash
        },
        sadadUrl: 'https://secure.sadadqa.com/webpurchase'  // Direct Payment API URL
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200,
      }
    );
  } catch (error) {
    console.error('Error in sadad-payment function:', error);
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
