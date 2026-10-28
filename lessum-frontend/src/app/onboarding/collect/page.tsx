import { CollectSettingsForm } from '@/components/onboarding/CollectSettingsForm'
import { OnboardingStepper } from '@/components/onboarding/OnboardingStepper'

export default function OnboardingCollectPage() {
  return (
    <main className="flex flex-1 flex-col items-center gap-6 px-4 py-8">
      <p className="w-full max-w-[800px] text-sm text-muted-foreground">
        자동 가계부 / 처음 설정
      </p>
      <div className="flex w-full max-w-[800px] flex-col gap-4 rounded-xl border bg-card p-8">
        <OnboardingStepper currentStep={2} />
        <h1 className="mt-2 text-[28px] font-bold">가져올 명세서 설정</h1>
        <CollectSettingsForm />
      </div>
    </main>
  )
}
