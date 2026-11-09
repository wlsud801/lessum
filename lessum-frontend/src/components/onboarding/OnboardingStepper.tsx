import { cn } from '@/lib/utils'

const STEPS = ['메일 연결', '수집 설정', '자동 등록', '첫 수집 결과']

interface OnboardingStepperProps {
  currentStep: number
  currentStepLabel?: string
}

export function OnboardingStepper({
  currentStep,
  currentStepLabel,
}: OnboardingStepperProps) {
  return (
    <ol className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      {STEPS.map((defaultLabel, index) => {
        const step = index + 1
        const isCurrent = step === currentStep
        const label =
          isCurrent && currentStepLabel ? currentStepLabel : defaultLabel
        return (
          <li
            key={label}
            aria-current={isCurrent ? 'step' : undefined}
            className={cn(
              'rounded-lg border px-3 py-2.5 text-[13px]',
              isCurrent
                ? 'border-border bg-muted font-bold text-foreground'
                : 'border-border bg-background text-muted-foreground',
            )}
          >
            {step} {label}
          </li>
        )
      })}
    </ol>
  )
}
