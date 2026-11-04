import { Button } from '@/components/ui/button'
import { finishOnboarding } from '@/lib/onboarding/actions'

interface FinishOnboardingFormProps {
  label: string
  variant?: 'default' | 'outline'
  className?: string
}

export function FinishOnboardingForm({
  label,
  variant = 'default',
  className,
}: FinishOnboardingFormProps) {
  return (
    <form action={finishOnboarding} className={className}>
      <Button type="submit" variant={variant} className="h-11 w-full font-bold">
        {label}
      </Button>
    </form>
  )
}
