import { OnboardingStepper } from '@/components/onboarding/OnboardingStepper'

export default function OnboardingAutoRegisterLoading() {
  return (
    <main className="flex flex-1 flex-col items-center gap-6 px-4 py-8">
      <p className="w-full max-w-[800px] text-sm text-muted-foreground">
        자동 가계부 / 처음 설정
      </p>
      <div className="flex w-full max-w-[800px] flex-col gap-4 rounded-xl border bg-card p-8">
        <OnboardingStepper currentStep={3} />
        <h1 className="mt-2 text-[28px] font-bold">명세서 자동 등록 켜기</h1>
        <div
          className="flex flex-col items-center gap-2 py-16 text-muted-foreground"
          role="status"
        >
          <p className="text-[15px]">수집 설정을 불러오는 중입니다…</p>
        </div>
      </div>
    </main>
  )
}
