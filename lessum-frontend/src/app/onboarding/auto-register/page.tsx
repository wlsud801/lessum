import { isAxiosError } from 'axios'
import { redirect } from 'next/navigation'

import { AutoRegisterForm } from '@/components/onboarding/AutoRegisterForm'
import { OnboardingStepper } from '@/components/onboarding/OnboardingStepper'
import { getAccessToken } from '@/lib/auth/api'
import { getCollectSummary } from '@/lib/onboarding/api'
import { formatDisplayDate } from '@/lib/onboarding/collect-schedule'
import type {
  CollectSummaryCard,
  CollectSummaryResponse,
} from '@/lib/onboarding/types'

const PROVIDER_LABELS: Record<string, string> = {
  naver: '네이버',
}

function arrivalLabel(card: CollectSummaryCard) {
  return card.arrival_day === 'last'
    ? `${card.name} 매월 말일`
    : `${card.name} 매월 ${card.arrival_day}일`
}

function summaryLines(summary: CollectSummaryResponse): string[] {
  const provider =
    PROVIDER_LABELS[summary.connection.provider] ?? summary.connection.provider
  const lines = [
    `${provider} · ${summary.connection.email} / ${summary.mailbox_name}`,
    summary.cards.map(arrivalLabel).join(' · '),
  ]
  if (summary.next_collect_on) {
    lines.push(
      `다음 자동 조회: ${formatDisplayDate(summary.next_collect_on)} · 한국시간 기준`,
    )
  }
  lines.push('설정을 마치면 기존 명세서를 한 번 가져옵니다.')
  return lines
}

export default async function OnboardingAutoRegisterPage() {
  const token = await getAccessToken()
  if (!token) {
    redirect('/login')
  }

  let summary: CollectSummaryResponse
  try {
    summary = await getCollectSummary(token)
  } catch (error) {
    if (isAxiosError(error) && error.response?.status === 404) {
      redirect('/onboarding/collect')
    }
    if (isAxiosError(error) && error.response?.status === 410) {
      redirect('/onboarding/mail')
    }
    throw error
  }

  return (
    <main className="flex flex-1 flex-col items-center gap-6 px-4 py-8">
      <p className="w-full max-w-[800px] text-sm text-muted-foreground">
        자동 가계부 / 처음 설정
      </p>
      <div className="flex w-full max-w-[800px] flex-col gap-4 rounded-xl border bg-card p-8">
        <OnboardingStepper currentStep={3} />
        <h1 className="mt-2 text-[28px] font-bold">명세서 자동 등록 켜기</h1>
        <AutoRegisterForm summaryLines={summaryLines(summary)} />
      </div>
    </main>
  )
}
