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
  event_title?: string
  event_date?: string
  quantity?: number
  total_amount?: number
  payment_id?: string | null
  error_message?: string | null
  error_source_label?: string | null
  logo_url?: string | null
  retry_url?: string | null
  invoice_url?: string | null
}

const RED = '#B3261E'
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
  quantity = 1,
  total_amount = 0,
  payment_id,
  error_message,
  error_source_label,
  logo_url,
  retry_url,
  invoice_url,
}: Props) => (
  <Html lang="ar" dir="rtl">
    <Head />
    <Preview>{`لم تتم عملية الدفع للحجز ${booking_reference}`}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Section style={header}>
          {logo_url ? (
            <Img src={logo_url} alt="" height={48} style={{ margin: '0 auto 12px' }} />
          ) : null}
          <Text style={brand}>حالة الدفع</Text>
          <Heading style={h1}>{event_title}</Heading>
          <Text style={subtle}>{formatDate(event_date)}</Text>
        </Section>

        <Section style={alertBox}>
          <Text style={alertTitle}>لم تكتمل عملية الدفع</Text>
          <Text style={alertAmount}>{`${Number(total_amount).toFixed(2)} ر.ق`}</Text>
          {error_source_label ? <Text style={alertMeta}>{`مصدر الرفض: ${error_source_label}`}</Text> : null}
          {error_message ? <Text style={alertMeta}>{error_message}</Text> : null}
        </Section>

        <Section style={card}>
          <DetailRow label="رقم الحجز" value={booking_reference} />
          <Hr style={hr} />
          <DetailRow label="الاسم" value={customer_name} />
          <Hr style={hr} />
          <DetailRow label="رقم الهاتف" value={customer_phone} />
          <Hr style={hr} />
          <DetailRow label="عدد التذاكر" value={String(quantity)} />
          {payment_id ? (
            <>
              <Hr style={hr} />
              <DetailRow label="رقم عملية سداد" value={payment_id} />
            </>
          ) : null}
        </Section>

        {retry_url ? (
          <Section style={{ textAlign: 'center' as const, margin: '26px 0 4px' }}>
            <Button href={retry_url} style={cta}>
              إعادة محاولة الحجز
            </Button>
            <Text style={ctaHint}>
              لم يتم خصم أي مبلغ. يمكنك المحاولة مرة أخرى ببطاقة أخرى أو التواصل مع البنك المصدر.
            </Text>
          </Section>
        ) : null}

        {invoice_url ? (
          <Text style={note}>
            لمتابعة حالة حجزك في أي وقت: {invoice_url}
          </Text>
        ) : null}

        <Hr style={{ ...hr, margin: '28px 0 16px' }} />
        <Text style={footer}>qcamelmc — نحن هنا لمساعدتك</Text>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: Email,
  subject: (data: Record<string, any>) =>
    `لم تتم عملية الدفع — ${data?.booking_reference ?? ''}`.trim(),
  displayName: 'فشل الدفع',
  previewData: {
    booking_reference: 'QTR-3-9-2026-004521',
    customer_name: 'محمد الأنصاري',
    customer_phone: '+97455512345',
    event_title: 'سباق الهجن',
    event_date: '2026-02-14',
    quantity: 2,
    total_amount: 100,
    error_message: 'تم رفض البطاقة من البنك المصدر',
    error_source_label: 'البنك / البطاقة',
    retry_url: 'https://qcamelmc.org',
  },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: 'Arial, Helvetica, sans-serif', color: INK }
const container = { padding: '28px 24px', maxWidth: '600px' }
const header = { textAlign: 'center' as const, marginBottom: '18px' }
const brand = { fontSize: '12px', letterSpacing: '2px', color: MUTED, margin: '0 0 6px' }
const h1 = { fontSize: '22px', margin: '0 0 4px', color: INK }
const subtle = { fontSize: '13px', color: MUTED, margin: 0 }
const alertBox = {
  textAlign: 'center' as const,
  border: `1px solid ${RED}`,
  borderRadius: '12px',
  padding: '18px',
  backgroundColor: '#FDF3F2',
}
const alertTitle = { fontSize: '16px', fontWeight: 'bold' as const, color: RED, margin: '0 0 6px' }
const alertAmount = { fontSize: '24px', fontWeight: 'bold' as const, color: INK, margin: '0 0 6px' }
const alertMeta = { fontSize: '13px', color: MUTED, margin: '2px 0' }
const card = { border: `1px solid ${LINE}`, borderRadius: '12px', padding: '6px 16px', marginTop: '18px' }
const detailRow = { padding: '10px 0' }
const detailLabel = { fontSize: '13px', color: MUTED, width: '45%' }
const detailValue = { fontSize: '14px', color: INK, textAlign: 'left' as const }
const hr = { borderColor: LINE, margin: '0' }
const cta = {
  backgroundColor: INK,
  color: '#ffffff',
  padding: '12px 26px',
  borderRadius: '8px',
  fontSize: '14px',
  textDecoration: 'none',
}
const ctaHint = { fontSize: '12px', color: MUTED, marginTop: '10px' }
const note = { fontSize: '12px', color: MUTED, marginTop: '18px', textAlign: 'center' as const }
const footer = { fontSize: '12px', color: MUTED, textAlign: 'center' as const }
