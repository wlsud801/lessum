import { isAxiosError } from 'axios'
import { redirect } from 'next/navigation'

import { CollectRunPoller } from '@/components/onboarding/CollectRunPoller'
import { FirstCollectProgress } from '@/components/onboarding/FirstCollectProgress'
import { FirstCollectResult } from '@/components/onboarding/FirstCollectResult'
import { OnboardingStepper } from '@/components/onboarding/OnboardingStepper'
import { getAccessToken } from '@/lib/auth/api'
import { getCollectSummary, getLatestCollectRun } from '@/lib/onboarding/api'
import type {
  CollectRunResponse,
  CollectSummaryResponse,
} from '@/lib/onboarding/types'

export default async function OnboardingResultPage() {
  const token = await getAccessToken()
  if (!token) {
    redirect('/login')
  }

  let run: CollectRunResponse | null = null
  try {
    run = await getLatestCollectRun(token)
  } catch (error) {
    if (isAxiosError(error) && error.response?.status === 404) {
      redirect('/onboarding/auto-register')
    }
    throw error
  }

  const isCollecting = run.status === 'queued' || run.status === 'running'

  let summary: CollectSummaryResponse | null = null
  if (isCollecting) {
    try {
      summary = await getCollectSummary(token)
    } catch {
      summary = null
    }
  }

  const heading =
    run.status === 'completed'
      ? '첫 명세서를 가져왔어요'
      : run.status === 'failed'
        ? '첫 명세서를 가져오지 못했어요'
        : '첫 명세서를 가져오고 있어요'

  return (
    <main className="flex flex-1 flex-col items-center gap-6 px-4 py-8">
      <p className="w-full max-w-[800px] text-sm text-muted-foreground">
        자동 가계부 / 처음 설정
      </p>
      <div className="flex w-full max-w-[800px] flex-col gap-4 rounded-xl border bg-card p-8">
        <OnboardingStepper
          currentStep={4}
          currentStepLabel={isCollecting ? '첫 수집 중' : undefined}
        />
        <h1 className="mt-2 text-[28px] font-bold">{heading}</h1>
        {isCollecting ? (
          <>
            <FirstCollectProgress run={run} summary={summary} />
            <CollectRunPoller />
          </>
        ) : (
          <FirstCollectResult run={run} />
        )}
      </div>
    </main>
  )
}
