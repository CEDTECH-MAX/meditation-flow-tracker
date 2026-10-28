import * as React from 'react'
import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Preview,
  Section,
  Text,
} from '@react-email/components'
import type { TemplateEntry } from './registry'

interface Props {
  name?: string
  studentNumber?: string
  cohort?: string
  period?: string
  sessions?: number
  points?: number
  requiredSessions?: number
  requiredPoints?: number
  institutionName?: string
  portalUrl?: string
}

const WeeklyTargetMissed = ({
  name,
  studentNumber,
  cohort,
  period,
  sessions = 0,
  points = 0,
  requiredSessions = 8,
  requiredPoints = 16,
  institutionName = 'Maharishi Invincibility Institute',
  portalUrl = 'https://meditationflo.lovable.app',
}: Props) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>
      You earned {points.toFixed(1)} of the required {requiredPoints} meditation points this week
    </Preview>
    <Body style={main}>
      <Container style={container}>
        <Text style={eyebrow}>CONSCIOUSNESS DEPARTMENT · {institutionName.toUpperCase()}</Text>
        <Heading style={h1}>Weekly meditation target not met</Heading>
        <Text style={text}>Dear {name || 'Student'},</Text>

        <Section style={details}>
          {studentNumber ? <Text style={detailLine}>Student number: {studentNumber}</Text> : null}
          {cohort ? <Text style={detailLine}>Cohort: {cohort}</Text> : null}
          {period ? <Text style={detailLine}>Period: {period}</Text> : null}
        </Section>

        <Text style={text}>
          This is an official notice that you have not met the weekly meditation attendance
          target for the week shown above.
        </Text>

        <Section style={results}>
          <Text style={resultLine}>
            Sessions attended: <strong>{sessions}</strong> of {requiredSessions}
          </Text>
          <Text style={resultLine}>
            Points earned: <strong>{points.toFixed(1)}</strong> of {requiredPoints.toFixed(1)}
          </Text>
        </Section>

        <Text style={text}>
          You did not reach the required {requiredPoints} points. Regular attendance is essential
          to your programme — please make every effort to improve your attendance this coming
          week.
        </Text>
        <Text style={text}>
          If you were ill or had another valid reason, please submit an appeal or upload your
          supporting letter through the student portal.
        </Text>

        <Section style={{ textAlign: 'center', margin: '28px 0' }}>
          <Button href={portalUrl} style={button}>
            Open the student portal
          </Button>
        </Section>

        <Hr style={hr} />
        <Text style={signoff}>
          Sincerely,
          <br />
          <strong>Consciousness Department</strong>
          <br />
          {institutionName}
        </Text>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: WeeklyTargetMissed,
  subject: (data: Record<string, any>) =>
    `Notice: Weekly Meditation Target Not Met${data.period ? ` — ${data.period}` : ''}`,
  displayName: 'Weekly meditation target not met',
  previewData: {
    name: 'Thandi Mokoena',
    studentNumber: 'MIU-2026-014',
    cohort: 'MI21 B',
    period: '19 Oct 2026 – 24 Oct 2026',
    sessions: 5,
    points: 10,
    requiredSessions: 8,
    requiredPoints: 16,
    institutionName: 'Maharishi Invincibility University',
    portalUrl: 'https://meditationflo.lovable.app',
  },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: 'Georgia, "Times New Roman", serif' }
const container = { padding: '32px 28px', maxWidth: '560px' }
const eyebrow = {
  fontSize: '11px',
  letterSpacing: '1.5px',
  color: '#a67c1f',
  fontWeight: 'bold' as const,
  margin: '0 0 10px',
  fontFamily: 'Arial, sans-serif',
}
const h1 = { fontSize: '24px', color: '#1f5b3f', margin: '0 0 20px', fontWeight: 'normal' as const }
const text = { fontSize: '15px', color: '#333333', lineHeight: '1.6', margin: '0 0 16px' }
const details = {
  backgroundColor: '#f3f8f4',
  borderRadius: '12px',
  padding: '12px 16px',
  margin: '0 0 18px',
}
const detailLine = { fontSize: '14px', color: '#1f5b3f', margin: '2px 0', fontFamily: 'Arial, sans-serif' }
const results = {
  borderLeft: '4px solid #c99a2e',
  padding: '6px 14px',
  margin: '0 0 18px',
}
const resultLine = { fontSize: '15px', color: '#333333', margin: '4px 0', fontFamily: 'Arial, sans-serif' }
const button = {
  backgroundColor: '#1f5b3f',
  color: '#ffffff',
  borderRadius: '999px',
  padding: '12px 26px',
  fontSize: '15px',
  textDecoration: 'none',
  fontFamily: 'Arial, sans-serif',
}
const hr = { borderColor: '#e6e6e6', margin: '24px 0' }
const signoff = { fontSize: '14px', color: '#555555', lineHeight: '1.6', margin: 0 }
