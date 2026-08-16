import * as React from 'npm:react@18.3.1'
import {
  Body,
  Container,
  Head,
  Heading,
  Button,
  Hr,
  Html,
  Img,
  Preview,
  Row,
  Column,
  Section,
  Text,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

interface Props {
  booking_reference?: string
  customer_name?: string
  customer_phone?: string
  event_title?: string
  event_date?: string
  ticket_type?: string
  quantity?: number
  total_amount?: number
  payment_id?: string | null
  payment_method?: string | null
  paid_at?: string | null
  logo_url?: string | null
  invoice_url?: string | null
}

const GOLD = '#C9A227'
const INK = '#14110E'
const MUTED = '#6B6257'
const LINE = '#EDE6DA'

const formatDate = (value?: string | null) => {
  if (!value) return '-'
  try {
    return new Date(value).toLocaleDateString('ar-u-nu-latn', {
      timeZone: 'Asia/Qatar',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
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
  booking_reference = '-',
  customer_name = '-',
  customer_phone = '-',
  event_title = '-',
  event_date,
  ticket_type = '-',
  quantity = 1,
  total_amount = 0,
  payment_id,
  payment_method,
  paid_at,
  logo_url,
  invoice_url,
}: Props) => (
  <Html lang="ar" dir="rtl">
    <Head />
    <Preview>{`فاتورة حجزك ${booking_reference} — تم تأكيد الدفع`}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Section style={header}>
          {logo_url ? (
            <Img src={logo_url} alt="" height={48} style={{ margin: '0 auto 12px' }} />
          ) : null}
          <Text style={brand}>فاتورة الحجز</Text>
          <Heading style={h1}>{event_title}</Heading>
          <Text style={subtle}>{formatDate(event_date)}</Text>
        </Section>

        <Section style={amountBox}>
          <Text style={amountLabel}>المبلغ المدفوع</Text>
          <Text style={amountValue}>{`${Number(total_amount).toFixed(2)} ر.ق`}</Text>
          <Text style={paidBadge}>تم تأكيد الدفع</Text>
        </Section>

        <Section style={card}>
          <DetailRow label="رقم الحجز" value={booking_reference} />
          <Hr style={hr} />
          <DetailRow label="الاسم" value={customer_name} />
          <Hr style={hr} />
          <DetailRow label="رقم الهاتف" value={customer_phone} />
          <Hr style={hr} />
          <DetailRow label="نوع التذكرة" value={ticket_type} />
          <Hr style={hr} />
          <DetailRow label="عدد التذاكر" value={String(quantity)} />
          <Hr style={hr} />
          <DetailRow
            label="طريقة الدفع"
            value={payment_method === 'cash_pos' ? 'نقداً / نقطة بيع' : 'سداد'}
          />
          {payment_id ? (
            <>
              <Hr style={hr} />
              <DetailRow label="رقم عملية الدفع" value={payment_id} />
            </>
          ) : null}
          {paid_at ? (
            <>
              <Hr style={hr} />
              <DetailRow label="تاريخ الدفع" value={formatDate(paid_at)} />
            </>
          ) : null}
        </Section>

        {invoice_url ? (
          <Section style={{ textAlign: 'center' as const, margin: '26px 0 4px' }}>
            <Button href={invoice_url} style={cta}>
              تحميل الفاتورة PDF
            </Button>
            <Text style={ctaHint}>يفتح صفحة فاتورتك مع رمز الدخول وإمكانية الحفظ PDF أو صورة</Text>
          </Section>
        ) : null}

        <Text style={note}>
          يرجى الاحتفاظ بهذه الفاتورة. تذاكرك ورمز الدخول تصلك عبر واتساب على الرقم المسجل.
        </Text>

        <Hr style={{ ...hr, margin: '28px 0 16px' }} />
        <Text style={footer}>qcamelmc — شكراً لثقتكم</Text>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: Email,
  subject: (data: Record<string, any>) =>
    `فاتورة حجزك ${data?.booking_reference ?? ''}`.trim(),
  displayName: 'فاتورة الحجز',
  previewData: {
    booking_reference: 'QC-2026-00123',
    customer_name: 'محمد الأنصاري',
    customer_phone: '+97455512345',
    event_title: 'سباق الهجن',
    event_date: '2026-02-14',
    ticket_type: 'VIP',
    quantity: 3,
    total_amount: 450,
    payment_id: 'SDD-889231',
    payment_method: 'sadad',
    paid_at: '2026-02-01',
    logo_url: null,
    invoice_url: 'https://qcamelmc.org/invoice/QC-2026-00123',
  },
} satisfies TemplateEntry

const main = {
  backgroundColor: '#ffffff',
  fontFamily: "'Segoe UI', Tahoma, Arial, sans-serif",
  color: INK,
}
const container = { padding: '32px 24px', maxWidth: '600px', margin: '0 auto' }
const header = { textAlign: 'center' as const, paddingBottom: '8px' }
const brand = {
  fontSize: '12px',
  letterSpacing: '3px',
  color: GOLD,
  margin: '0 0 6px',
  fontWeight: 700,
}
const h1 = { fontSize: '24px', margin: '0 0 4px', color: INK }
const subtle = { fontSize: '14px', color: MUTED, margin: 0 }
const amountBox = {
  textAlign: 'center' as const,
  border: `1px solid ${LINE}`,
  borderTop: `3px solid ${GOLD}`,
  borderRadius: '14px',
  padding: '20px',
  margin: '24px 0',
  backgroundColor: '#FCFAF6',
}
const amountLabel = { fontSize: '13px', color: MUTED, margin: '0 0 4px' }
const amountValue = { fontSize: '30px', fontWeight: 700, color: INK, margin: '0 0 8px' }
const paidBadge = {
  fontSize: '12px',
  color: '#1F7A44',
  backgroundColor: '#E8F5ED',
  borderRadius: '999px',
  padding: '5px 12px',
  display: 'inline-block',
  margin: 0,
}
const card = { border: `1px solid ${LINE}`, borderRadius: '14px', padding: '4px 18px' }
const detailRow = { padding: '10px 0' }
const detailLabel = { fontSize: '13px', color: MUTED, width: '45%' }
const detailValue = { fontSize: '14px', color: INK, fontWeight: 600, textAlign: 'left' as const }
const hr = { borderColor: LINE, margin: '0' }
const cta = {
  backgroundColor: GOLD,
  color: '#ffffff',
  fontSize: '15px',
  fontWeight: 700,
  borderRadius: '999px',
  padding: '13px 34px',
  textDecoration: 'none',
  display: 'inline-block',
}
const ctaHint = { fontSize: '12px', color: MUTED, margin: '10px 0 0' }
const note = { fontSize: '13px', color: MUTED, lineHeight: '22px', marginTop: '20px' }
const footer = { fontSize: '12px', color: MUTED, textAlign: 'center' as const }
