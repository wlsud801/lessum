import { AutoRegisterForm } from '@/components/onboarding/AutoRegisterForm'
import { OnboardingStepper } from '@/components/onboarding/OnboardingStepper'

export default function OnboardingAutoRegisterPage() {
  return (
    <main className="flex flex-1 flex-col items-center gap-6 px-4 py-8">
      <p className="w-full max-w-[800px] text-sm text-muted-foreground">
        자동 가계부 / 처음 설정
      </p>
      <div className="flex w-full max-w-[800px] flex-col gap-4 rounded-xl border bg-card p-8">
        <OnboardingStepper currentStep={3} />
        <h1 className="mt-2 text-[28px] font-bold">명세서 자동 등록 켜기</h1>
        <AutoRegisterForm />
      </div>
    </main>
  )
}
