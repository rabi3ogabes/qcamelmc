export interface InvoiceData {
  booking_reference: string;
  customer_name: string;
  customer_phone: string;
  nationality: string | null;
  ticket_type: string;
  quantity: number;
  total_amount: number;
  payment_status: string;
  event_title: string;
  event_date: string;
  qr_codes: string[];
  ticket_types: string[];
  logo_url?: string | null;
  payment_id?: string | null;
  payment_method?: string | null;
  paid_at?: string | null;
}

const TICKET_TYPE_LABELS: Record<string, string> = {
  normal: 'عادي',
  vip: 'VIP',
  parking: 'مواقف',
};

const ticketLabel = (type?: string | null) =>
  (type && TICKET_TYPE_LABELS[type.toLowerCase()]) || type || '-';

export const generateInvoicePdf = (data: InvoiceData) => {
  const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;

  const qrItems = data.qr_codes.map((qr, i) => {
    const url = qr.startsWith('http') ? qr : `${supabaseUrl}/storage/v1/object/public/qr-codes/${qr}.png`;
    const type = ticketLabel(data.ticket_types[i] || data.ticket_type);
    return `<div class="qr-item"><img src="${url}" alt="QR" /><span>${type}</span></div>`;
  }).join('');

  const statusClass = data.payment_status === 'confirmed' ? 'paid' : 'pending';
  const statusText = data.payment_status === 'confirmed' ? 'مدفوع' : 'قيد الانتظار';

  const html = `<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>فاتورة - ${data.booking_reference}</title>
  <style>
    @page { size: A4; margin: 1cm; }
    body {
      font-family: 'Tahoma', 'Cairo', sans-serif;
      background: #fff; margin: 0; padding: 0;
      color: #4a3728; direction: rtl; font-size: 14px;
    }
    .invoice-container {
      width: 100%; background: #fff; border: 1px solid #e7e2dc;
      border-radius: 12px; padding: 25px 30px; box-sizing: border-box;
    }
    .header { text-align: center; border-bottom: 2px solid #c27444; padding-bottom: 10px; margin-bottom: 15px; }
    .header img { width: 160px; margin-bottom: 6px; }
    .header h1 { margin: 0; font-size: 22px; color: #a4552b; }
    .header p { margin: 2px 0 0 0; color: #6b4b2a; font-weight: 600; font-size: 14px; }
    .section-title {
      font-size: 16px; font-weight: 700; color: #a4552b;
      margin: 10px 0 6px 0; border-bottom: 2px solid #d8b59f;
      display: inline-block; padding-bottom: 2px;
    }
    .details-line { display: flex; justify-content: space-between; gap: 10px; margin-bottom: 10px; }
    .details-line p { margin: 0; font-size: 14px; flex: 1; }
    .order-summary { border: 1px solid #e8d9cc; border-radius: 8px; background: #fdfaf8; margin-bottom: 10px; }
    .order-summary table { width: 100%; border-collapse: collapse; }
    .order-summary th, .order-summary td { padding: 8px; border-bottom: 1px solid #e7e2dc; text-align: right; font-size: 13px; }
    .order-summary th { background: #f4ede6; color: #8b4a2a; font-weight: 600; }
    .status { padding: 3px 10px; border-radius: 12px; font-weight: 600; font-size: 12px; }
    .status.paid { background: #e8f7e6; color: #2c7a3f; }
    .status.pending { background: #fff4e5; color: #b47400; }
    .qr-section { margin-top: 10px; border: 1px solid #e8d9cc; border-radius: 8px; padding: 15px; background: #fdfaf8; }
    .qr-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(180px, 1fr)); gap: 10px; text-align: center; }
    .qr-item { border: 1px solid #e8d9cc; border-radius: 8px; padding: 8px; background: #fff; }
    .qr-item img { width: 180px; height: 180px; object-fit: contain; margin-bottom: 5px; }
    .qr-item span { font-size: 12px; font-weight: 600; color: #6b4b2a; }
    .thanks { text-align: center; margin-top: 10px; font-weight: 700; color: #a4552b; }
    .footer { text-align: center; margin-top: 10px; font-size: 11px; color: #776150; border-top: 1px solid #e8d9cc; padding-top: 8px; }
    @media print { body { -webkit-print-color-adjust: exact; print-color-adjust: exact; } }
  </style>
</head>
<body>
  <div class="invoice-container">
    <div class="header">
      ${data.logo_url ? `<img src="${data.logo_url}" alt="Logo" />` : ''}
      <h1>فاتورة</h1>
      <p>رقم الفاتورة: ${data.booking_reference}</p>
    </div>

    <div class="section-title">بيانات العميل</div>
    <div class="details-line">
      <p>الاسم: ${data.customer_name}</p>
      <p>رقم الهاتف: ${data.customer_phone}</p>
      <p>الجنسية: ${data.nationality || '-'}</p>
    </div>

    <div class="section-title">بيانات الدفع</div>
    <div class="details-line">
      <p>وسيلة الدفع: ${data.payment_method === 'cash_pos' ? 'نقاط البيع' : 'سداد (أونلاين)'}</p>
      <p>رقم عملية سداد: ${data.payment_id || '-'}</p>
      <p>تاريخ الدفع: ${data.paid_at ? new Date(data.paid_at).toLocaleString('ar-u-nu-latn', { timeZone: 'Asia/Qatar', dateStyle: 'medium', timeStyle: 'short' }) : '-'}</p>
    </div>

    <div class="section-title">تفاصيل التذاكر</div>
    <div class="order-summary">
      <table>
        <thead><tr><th>نوع التذكرة</th><th>الكمية</th><th>اليوم</th><th>إجمالي المبلغ</th><th>حالة الدفع</th></tr></thead>
        <tbody><tr>
          <td>${ticketLabel(data.ticket_type)}</td>
          <td>${data.quantity}</td>
          <td>${data.event_title}</td>
          <td>${data.total_amount} ر.ق</td>
          <td><span class="status ${statusClass}">${statusText}</span></td>
        </tr></tbody>
      </table>
    </div>

    ${qrItems ? `
    <div class="section-title">رموز التذاكر (QR)</div>
    <div class="qr-section">
      <div class="qr-grid">${qrItems}</div>
    </div>` : ''}

    <div class="thanks">شكراً لثقتكم في مهرجان قطر للإبل - جزيلات العطا - 2026 💛</div>
    <div class="footer">جميع الحقوق محفوظة © مهرجان قطر للإبل - جزيلات العطا - 2026</div>
  </div>
</body>
</html>`;

  // Open in a new window and trigger print (Save as PDF)
  const printWindow = window.open('', '_blank');
  if (!printWindow) {
    alert('يرجى السماح بالنوافذ المنبثقة لتوليد الفاتورة');
    return;
  }
  printWindow.document.write(html);
  printWindow.document.close();

  // Wait for images to load then print
  printWindow.onload = () => {
    setTimeout(() => {
      printWindow.print();
    }, 500);
  };
};
