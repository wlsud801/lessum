import { LoaderCircle } from 'lucide-react'

import { FinishOnboardingForm } from '@/components/onboarding/FinishOnboardingForm'
import { formatDisplayDate } from '@/lib/onboarding/collect-schedule'
import { cn } from '@/lib/utils'
import type {
  CollectRunResponse,
  CollectSummaryResponse,
} from '@/lib/onboarding/types'

interface FirstCollectProgressProps {
  run: CollectRunResponse
  summary: CollectSummaryResponse | null
}

const PROVIDER_NAMES: Record<string, string> = {
  naver: '네이버',
}

const STAGES = [
  {
    label: '메일함 확인',
    title: '메일함을 확인하고 있어요',
    description: '명세서가 도착한 메일을 찾는 중이에요.',
  },
  {
    label: '명세서 분석',
    title: '명세서를 분석하고 있어요',
    description: '도착한 명세서에서 거래 내역을 읽는 중이에요.',
  },
  {
    label: '거래 정리',
    title: '거래를 정리하고 있어요',
    description: '읽어온 내역을 가계부에 반영하는 중이에요.',
  },
]

function currentStage(run: CollectRunResponse): number {
  if (run.cards.some((itCard) => itCard.status !== 'queued' && itCard.status !== 'received')) {
    return 3
  }
  if (run.cards.some((itCard) => itCard.status === 'received')) {
    return 2
  }
  return 1
}

export function FirstCollectProgress({ run, summary }: FirstCollectProgressProps) {
  const stage = currentStage(run)
  const current = STAGES[stage - 1]

  return (
    <div className="flex flex-col gap-4">
      <p className="text-[15px] text-muted-foreground">
        연결한 메일함에서 선택한 카드의 명세서를 찾고 있어요.
      </p>
      <section
        aria-live="polite"
        className="flex flex-col gap-5 rounded-lg border bg-muted p-6"
      >
        <div className="flex items-center gap-4">
          <LoaderCircle
            aria-hidden
            className="size-10 shrink-0 animate-spin text-muted-foreground"
          />
          <div className="flex flex-col gap-1">
            <p className="text-[17px] font-bold">{current.title}</p>
            <p className="text-[15px] text-muted-foreground">
              {current.description}
            </p>
          </div>
        </div>
        <ol className="grid gap-3 sm:grid-cols-3">
          {STAGES.map((itStage, index) => {
            const step = index + 1
            const isCurrent = step === stage
            const statusLabel =
              step < stage ? '완료' : isCurrent ? '진행 중' : '대기'
            return (
              <li
                key={itStage.label}
                aria-current={isCurrent ? 'step' : undefined}
                className={cn(
                  'flex flex-col gap-1 rounded-lg border p-3',
                  isCurrent
                    ? 'border-foreground/30 bg-background'
                    : 'bg-background/50 text-muted-foreground',
                )}
              >
                <p className={cn('text-sm', isCurrent && 'text-[17px] font-bold')}>
                  {step} {itStage.label}
                </p>
                <p className="text-xs text-muted-foreground">{statusLabel}</p>
              </li>
            )
          })}
        </ol>
      </section>
      {summary && (
        <section className="flex flex-col gap-1.5 rounded-lg border px-5 py-4">
          <p className="text-sm">
            {PROVIDER_NAMES[summary.connection.provider] ??
              summary.connection.provider}{' '}
            · {summary.connection.email} / {summary.mailbox_name}
          </p>
          <p className="text-[15px] text-muted-foreground">
            대상 카드 {summary.cards.map((itCard) => itCard.name).join(' · ')}
            {' | '}
            {formatDisplayDate(summary.start_date)}부터
          </p>
        </section>
      )}
      <div className="text-[13px] text-muted-foreground">
        <p>명세서 수에 따라 조금 걸릴 수 있어요.</p>
        <p>명세서 파일은 분석에만 사용하고 보관하지 않아요.</p>
      </div>
      <div className="flex items-center gap-4">
        <FinishOnboardingForm
          label="가계부 먼저 보기"
          variant="outline"
          className="w-[220px]"
        />
        <p className="text-xs text-muted-foreground">
          이 화면을 나가도 가져오기는 계속돼요.
        </p>
      </div>
    </div>
  )
}
