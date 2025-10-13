import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Checksum generation functions based on Sadad documentation
function generateSalt(length: number): string {
  const chars = "AbcDE123IJKLMN67QRSTUVWXYZaBCdefghijklmn123opq45rs67tuv89wxyz0FGH45OP89";
  let salt = "";
  for (let i = 0; i < length; i++) {
    salt += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return salt;
}

async function encrypt(text: string, key: string): Promise<string> {
  const iv = new TextEncoder().encode("@@@@&&&&####$$$$");
  const keyData = new TextEncoder().encode(key);
  
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    keyData.slice(0, 16),
    { name: "AES-CBC", length: 128 },
    false,
    ["encrypt"]
  );
  
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-CBC", iv },
    cryptoKey,
    new TextEncoder().encode(text)
  );
  
  return btoa(String.fromCharCode(...new Uint8Array(encrypted)));
}

async function getChecksumFromString(str: string, key: string): Promise<string> {
  const salt = generateSalt(4);
  const finalString = `${str}|${salt}`;
  
  const hashBuffer = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(finalString)
  );
  
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  const hashString = hashHex + salt;
  
  const checksum = await encrypt(hashString, key);
  return checksum;
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
      .select('sadad_merchant_id, sadad_secret, webhook_url')
      .single();

    if (settingsError || !settings) {
      throw new Error('Sadad settings not configured');
    }

    if (!settings.sadad_merchant_id || !settings.sadad_secret) {
      throw new Error('Sadad credentials missing');
    }

    // Prepare payment data
    const txnDate = new Date().toISOString().replace('T', ' ').substring(0, 19);
    const callbackUrl = `${req.headers.get('origin')}/sadad-callback`;
    
    // Payment data - parameter names are CASE-SENSITIVE per Sadad docs
    const paymentData = {
      merchant_id: settings.sadad_merchant_id,  // lowercase per docs
      ORDER_ID: orderId,                         // UPPERCASE per docs
      WEBSITE: req.headers.get('origin')?.replace('https://', '').replace('http://', '') || 'localhost',
      TXN_AMOUNT: orderData.total_amount.toFixed(2),  // UPPERCASE per docs
      CUST_ID: orderData.customer_email,
      EMAIL: orderData.customer_email,
      MOBILE_NO: orderData.customer_phone.replace(/[^0-9]/g, ''),
      SADAD_WEBCHECKOUT_PAGE_LANGUAGE: 'Arb',
      VERSION: '1.1',
      CALLBACK_URL: callbackUrl,
      txnDate: txnDate,
      productdetail: orderData.items.map((item: any, index: number) => ({
        order_id: orderId,              // lowercase to match merchant_id convention
        itemname: item.name,
        amount: item.price.toFixed(2),
        quantity: item.quantity.toString(),
        type: 'line_item'
      }))
    };

    // Generate checksumhash using the exact format from Sadad documentation
    // Must be JSON structure with postData and secretKey
    const checksumData = {
      postData: paymentData,
      secretKey: settings.sadad_secret
    };
    
    const dataString = JSON.stringify(checksumData);
    const key = settings.sadad_secret + settings.sadad_merchant_id;
    const checksumhash = await getChecksumFromString(dataString, key);

    console.log('Generated checksum for order:', orderId);
    console.log('Merchant ID:', settings.sadad_merchant_id);
    console.log('Payment amount:', orderData.total_amount);

    return new Response(
      JSON.stringify({ 
        success: true,
        paymentData: {
          ...paymentData,
          checksumhash
        },
        sadadUrl: 'https://sadadqa.com/webpurchase'
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
