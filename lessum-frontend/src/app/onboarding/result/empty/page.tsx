import { EmptyCollectResult } from '@/components/onboarding/EmptyCollectResult'
import { OnboardingStepper } from '@/components/onboarding/OnboardingStepper'

export default function OnboardingEmptyResultPage() {
  return (
    <main className="flex flex-1 flex-col items-center gap-6 px-4 py-8">
      <p className="w-full max-w-[800px] text-sm text-muted-foreground">
        자동 가계부 / 처음 설정
      </p>
      <div className="flex w-full max-w-[800px] flex-col gap-4 rounded-xl border bg-card p-8">
        <OnboardingStepper currentStep={4} />
        <h1 className="mt-2 text-[28px] font-bold">
          연결 완료 · 새 명세서를 기다리고 있어요
        </h1>
        <EmptyCollectResult />
      </div>
    </main>
  )
}
