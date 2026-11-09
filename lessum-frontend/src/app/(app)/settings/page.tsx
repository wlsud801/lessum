import { isAxiosError } from 'axios'
import { redirect } from 'next/navigation'
import { connection } from 'next/server'

import { ConnectionCard } from '@/components/settings/ConnectionCard'
import { SettingsMenuRow } from '@/components/settings/SettingsMenuRow'
import { getAccessToken } from '@/lib/auth/api'
import { getCollectSummary } from '@/lib/onboarding/api'
import { formatDisplayDate } from '@/lib/onboarding/collect-schedule'
import { getPaymentMethods } from '@/lib/transactions/api'

import type { CollectSummaryResponse } from '@/lib/onboarding/types'

const PROVIDER_LABELS: Record<string, string> = {
  naver: '네이버',
}

const SETTINGS_MENUS = [
  {
    title: '카테고리·자동 분류',
    description: '수입·지출 카테고리와 자동 분류 규칙을 관리해요.',
    action: '분류 설정 →',
  },
  {
    title: '데이터 관리',
    description: '저장한 거래 내역을 CSV 파일로 내보내요.',
    action: '데이터 내보내기 →',
  },
  {
    title: '계정 설정',
    description: '로그인 정보와 계정 상태를 확인하고 관리해요.',
    action: '계정 관리 →',
  },
]

async function getCollectSummaryOrNull(
  token: string,
): Promise<CollectSummaryResponse | null> {
  try {
    return await getCollectSummary(token)
  } catch (error) {
    if (isAxiosError(error) && error.response?.status === 404) {
      return null
    }
    throw error
  }
}

function mailCardProps(summary: CollectSummaryResponse | null) {
  if (!summary) {
    return {
      status: '메일이 연결되지 않았어요',
      lines: ['메일을 연결하면 카드 명세서를 자동으로 가져와요.'],
      action: '메일 연결하기 →',
    }
  }

  const provider =
    PROVIDER_LABELS[summary.connection.provider] ?? summary.connection.provider
  const lines = [
    `자동 수집 ${summary.auto_register_enabled ? '켜짐' : '꺼짐'} · ${summary.connection.email}`,
  ]
  if (summary.next_collect_on) {
    lines.push(`다음 자동 조회 ${formatDisplayDate(summary.next_collect_on)}`)
  }

  return {
    status: `${provider} 메일 연결됨`,
    lines,
    action: '메일 연결·수집 관리 →',
  }
}

export default async function SettingsPage() {
  await connection()

  const token = await getAccessToken()
  if (!token) {
    redirect('/login')
  }

  const [summary, paymentMethods] = await Promise.all([
    getCollectSummaryOrNull(token),
    getPaymentMethods(),
  ])

  const cardCount = paymentMethods.filter(
    (itMethod) => itMethod.method_type === 'CARD',
  ).length
  const accountCount = paymentMethods.filter(
    (itMethod) => itMethod.method_type === 'ACCOUNT',
  ).length

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-2">
        <p className="text-[13px] text-muted-foreground">Lessum / 가계부 관리</p>
        <h1 className="text-[28px] font-bold">가계부 관리</h1>
        <p className="text-base text-muted-foreground">
          메일 연결부터 카드·계좌, 분류 규칙까지 한곳에서 관리해요.
        </p>
      </div>
      <section className="flex flex-col gap-4">
        <h2 className="text-lg font-bold">연결 관리</h2>
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <ConnectionCard
            title="메일 자동 수집"
            href="/settings/mail"
            {...mailCardProps(summary)}
          />
          <ConnectionCard
            title="카드·계좌 관리"
            status={`카드 ${cardCount}개 · 계좌 별칭 ${accountCount}개`}
            lines={[
              '기록에 사용할 결제 수단과 별칭을 정리해요.',
              '계좌 별칭은 수기 기록에 사용해요.',
            ]}
            action="카드·계좌 관리 →"
          />
        </div>
      </section>
      <section className="flex flex-col gap-4">
        <h2 className="text-lg font-bold">가계부 설정</h2>
        <div className="divide-y rounded-xl border">
          {SETTINGS_MENUS.map((itMenu) => (
            <SettingsMenuRow key={itMenu.title} {...itMenu} />
          ))}
        </div>
      </section>
    </div>
  )
}
