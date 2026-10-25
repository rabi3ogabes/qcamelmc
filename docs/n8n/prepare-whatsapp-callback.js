// Installed in both Prepare Lovable Payload nodes (the PDF branch uses the picker name ending in 1).
const invoiceData = $('Pick Random Invoice + WhatsApp Number').first().json;
const bookingRef = invoiceData.booking_reference || invoiceData.body?.booking_reference;
const deliveryId = invoiceData.delivery_id || invoiceData.body?.delivery_id;
const result = $input.first().json;
const provider = result.data;

if (!bookingRef) throw new Error('Missing original booking_reference');
if (deliveryId && !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(deliveryId)) {
  throw new Error('Invalid original delivery_id');
}
// A completed node alone is not proof. Require the provider's success and outgoing message ID.
const sent = result.success === true && typeof provider?.key?.id === 'string'
  && provider.key.id.trim().length > 0 && provider.key.fromMe === true;

return {
  json: {
    booking_reference: bookingRef,
    ...(deliveryId ? { delivery_id: deliveryId } : {}),
    status: sent ? 'success' : 'failed',
    message: sent
      ? 'تم إرسال الفاتورة إلى مزود واتساب بنجاح'
      : 'لم يؤكد مزود واتساب نجاح إرسال الفاتورة',
  },
};