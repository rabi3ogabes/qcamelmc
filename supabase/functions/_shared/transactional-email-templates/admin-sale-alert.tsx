import * as React from 'npm:react@18.3.1'
import {
  Body,
  Button,
  Column,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Img,
  Preview,
  Row,
  Section,
  Text,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

interface Props {
  booking_reference?: string
  customer_name?: string
  customer_phone?: string
  customer_email?: string | null
  event_title?: string
  event_date?: string | null
  quantity?: number
  total_amount?: number
  payment_id?: string | null
  payment_method?: string | null
  source_label?: string
  sold_at?: string | null
  logo_url?: string | null
  invoice_url?: string | null
  holders_summary?: string | null
}

const GOLD = '#B08B4F'
const INK = '#14110E'
const MUTED = '#6B6257'
const LINE = '#EDE6DA'

const formatDateTime = (value?: string | null) => {
  if (!value) return '-'
  try {
    return new Date(value).toLocaleString('ar-u-nu-latn', {
      timeZone: 'Asia/Qatar',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    })
  } catch {
    return value
  }
}

const DetailRow = ({ label, value }: { label: string; value: string }) => (
  <Row style={detailRow}>
    <Column style={detailLabel}>{label}</Column>
    <Column style={detailValue}>{value}</Column>
  </Row>
)

const Email = ({
  booking_reference,
  customer_name,
  customer_phone,
  customer_email,
  event_title,
  event_date,
  quantity,
  total_amount,
  payment_id,
  payment_method,
  source_label,
  sold_at,
  logo_url,
  invoice_url,
  holders_summary,
}: Props) => (
  <Html lang="ar" dir="rtl">
    <Head />
    <Preview>{`عملية بيع جديدة — ${booking_reference || ''} بمبلغ ${total_amount ?? '-'} ر.ق`}</Preview>
    <Body style={main}>
      <Container style={container}>
        {logo_url ? (
          <Section style={{ textAlign: 'center', paddingBottom: '12px' }}>
            <Img src={logo_url} alt="" width="80" style={{ margin: '0 auto' }} />
          </Section>
        ) : null}

        <Heading style={heading}>تم تأكيد عملية بيع جديدة</Heading>
        <Text style={subtitle}>
          {source_label || 'حجز جديد'} — {quantity ?? '-'} تذكرة بمبلغ {total_amount ?? '-'} ر.ق
        </Text>

        <Hr style={hr} />

        <Section>
          <DetailRow label="رقم الحجز" value={booking_reference || '-'} />
          <DetailRow label="اسم العميل" value={customer_name || '-'} />
          <DetailRow label="هاتف العميل" value={customer_phone || '-'} />
          <DetailRow label="بريد العميل" value={customer_email || '-'} />
          <DetailRow label="الفعالية" value={event_title || '-'} />
          <DetailRow label="تاريخ الفعالية" value={formatDateTime(event_date)} />
          <DetailRow label="عدد التذاكر" value={String(quantity ?? '-')} />
          <DetailRow label="المبلغ" value={`${total_amount ?? '-'} ر.ق`} />
          <DetailRow label="طريقة الدفع" value={payment_method === 'cash_pos' ? 'نقدي / نقاط البيع' : 'سداد'} />
          <DetailRow label="رقم العملية" value={payment_id || '-'} />
          <DetailRow label="وقت البيع" value={formatDateTime(sold_at)} />
          {holders_summary ? <DetailRow label="حاملو التذاكر" value={holders_summary} /> : null}
        </Section>

        {invoice_url ? (
          <Section style={{ textAlign: 'center', padding: '20px 0 4px' }}>
            <Button href={invoice_url} style={button}>
              عرض الفاتورة
            </Button>
          </Section>
        ) : null}

        <Hr style={hr} />
        <Text style={footer}>رسالة تلقائية من نظام إدارة التذاكر.</Text>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: Email,
  subject: (data: Record<string, any>) =>
    `بيع جديد — ${data?.booking_reference || ''} (${data?.total_amount ?? ''} ر.ق)`,
  displayName: 'إشعار الإدارة ببيع جديد',
  previewData: {
    booking_reference: 'QTR-3-9-2026-AB12CD',
    customer_name: 'أحمد المالكي',
    customer_phone: '+97466793776',
    customer_email: 'ahmed@example.com',
    event_title: 'فعالية أكتوبر 2026',
    event_date: '2026-10-03T17:00:00Z',
    quantity: 3,
    total_amount: 300,
    payment_id: '1234567890',
    payment_method: 'sadad',
    source_label: 'دفع إلكتروني (سداد)',
    sold_at: '2026-09-14T08:00:00Z',
    holders_summary: 'أحمد المالكي (VIP)، سارة (عادي)',
  },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: 'Tahoma, Arial, sans-serif' }
const container = { padding: '24px 28px', maxWidth: '600px' }
const heading = { color: INK, fontSize: '22px', margin: '0 0 6px', textAlign: 'center' as const }
const subtitle = { color: MUTED, fontSize: '14px', margin: '0', textAlign: 'center' as const }
const hr = { borderColor: LINE, margin: '20px 0' }
const detailRow = { borderBottom: `1px solid ${LINE}` }
const detailLabel = { color: MUTED, fontSize: '13px', padding: '10px 0', width: '40%' }
const detailValue = { color: INK, fontSize: '14px', fontWeight: 600, padding: '10px 0' }
const button = {
  backgroundColor: GOLD,
  borderRadius: '8px',
  color: '#ffffff',
  fontSize: '15px',
  padding: '12px 26px',
  textDecoration: 'none',
}
const footer = { color: MUTED, fontSize: '12px', textAlign: 'center' as const }
