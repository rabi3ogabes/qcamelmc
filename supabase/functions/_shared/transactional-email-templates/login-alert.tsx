import * as React from 'npm:react@18.3.1'
import {
  Body,
  Column,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Preview,
  Row,
  Section,
  Text,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

interface Props {
  identifier?: string
  kind_label?: string
  attempts?: number
  blocked_minutes?: number
  ip_address?: string | null
  user_agent?: string | null
  occurred_at?: string | null
}

const INK = '#14110E'
const MUTED = '#6B6257'
const LINE = '#EDE6DA'
const DANGER = '#8E2C2C'

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
  identifier,
  kind_label,
  attempts,
  blocked_minutes,
  ip_address,
  user_agent,
  occurred_at,
}: Props) => (
  <Html lang="ar" dir="rtl">
    <Head />
    <Preview>{`محاولات دخول متكررة فاشلة — ${identifier || ''}`}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Heading style={heading}>تنبيه أمني: محاولات دخول متكررة</Heading>
        <Text style={subtitle}>
          تم إيقاف الدخول مؤقتًا لمدة {blocked_minutes ?? 30} دقيقة بعد {attempts ?? 5} محاولات فاشلة.
        </Text>

        <Hr style={hr} />

        <Section>
          <DetailRow label="المُعرّف المستخدم" value={identifier || '-'} />
          <DetailRow label="نوع الدخول" value={kind_label || '-'} />
          <DetailRow label="عدد المحاولات" value={String(attempts ?? '-')} />
          <DetailRow label="وقت الحظر" value={formatDateTime(occurred_at)} />
          <DetailRow label="عنوان الشبكة" value={ip_address || '-'} />
          <DetailRow label="الجهاز / المتصفح" value={user_agent || '-'} />
        </Section>

        <Hr style={hr} />
        <Text style={footer}>رسالة تلقائية من نظام إدارة التذاكر.</Text>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: Email,
  subject: (data: Record<string, any>) =>
    `تنبيه أمني: محاولات دخول فاشلة (${data?.identifier || ''})`,
  displayName: 'تنبيه محاولات الدخول الفاشلة',
  previewData: {
    identifier: 'someone@example.com',
    kind_label: 'لوحة التحكم',
    attempts: 5,
    blocked_minutes: 30,
    ip_address: '81.12.34.56',
    user_agent: 'Chrome on iPhone',
    occurred_at: '2026-09-21T09:00:00Z',
  },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: 'Tahoma, Arial, sans-serif' }
const container = { padding: '24px 28px', maxWidth: '600px' }
const heading = { color: DANGER, fontSize: '22px', margin: '0 0 6px', textAlign: 'center' as const }
const subtitle = { color: MUTED, fontSize: '14px', margin: '0', textAlign: 'center' as const }
const hr = { borderColor: LINE, margin: '20px 0' }
const detailRow = { borderBottom: `1px solid ${LINE}` }
const detailLabel = { color: MUTED, fontSize: '13px', padding: '10px 0', width: '40%' }
const detailValue = { color: INK, fontSize: '14px', fontWeight: 600, padding: '10px 0' }
const footer = { color: MUTED, fontSize: '12px', textAlign: 'center' as const }
