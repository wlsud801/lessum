import { NaverMailConnectForm } from '@/components/onboarding/NaverMailConnectForm'
import { OnboardingStepper } from '@/components/onboarding/OnboardingStepper'

export default function OnboardingMailPage() {
  return (
    <main className="flex flex-1 flex-col items-center gap-6 px-4 py-8">
      <p className="w-full max-w-[800px] text-sm text-muted-foreground">
        자동 가계부 / 처음 설정
      </p>
      <div className="flex w-full max-w-[800px] flex-col gap-4 rounded-xl border bg-card p-8">
        <OnboardingStepper currentStep={1} />
        <h1 className="mt-2 text-[28px] font-bold">네이버 메일 연결</h1>
        <p className="text-lg">명세서를 받는 네이버 메일을 연결해주세요.</p>
        <NaverMailConnectForm />
      </div>
    </main>
  )
}
