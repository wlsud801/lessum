import { FirstCollectResult } from '@/components/onboarding/FirstCollectResult'
import { OnboardingStepper } from '@/components/onboarding/OnboardingStepper'

export default function OnboardingResultPage() {
  return (
    <main className="flex flex-1 flex-col items-center gap-6 px-4 py-8">
      <p className="w-full max-w-[800px] text-sm text-muted-foreground">
        자동 가계부 / 처음 설정
      </p>
      <div className="flex w-full max-w-[800px] flex-col gap-4 rounded-xl border bg-card p-8">
        <OnboardingStepper currentStep={4} />
        <h1 className="mt-2 text-[28px] font-bold">첫 명세서를 가져왔어요</h1>
        <FirstCollectResult />
      </div>
    </main>
  )
}
