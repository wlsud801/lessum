'use client'

import { useActionState } from 'react'

import { FormAlert } from '@/components/auth/FormAlert'
import { Button } from '@/components/ui/button'
import { resendConfirmation } from '@/lib/auth/actions'

interface ResendConfirmationFormProps {
  email: string
}

export function ResendConfirmationForm({ email }: ResendConfirmationFormProps) {
  const [state, formAction, isPending] = useActionState(resendConfirmation, {})

  return (
    <form action={formAction} className="flex flex-col gap-3">
      <FormAlert error={state.error} message={state.message} />
      <input type="hidden" name="email" value={email} />
      <Button
        type="submit"
        variant="outline"
        size="lg"
        disabled={isPending || !email}
      >
        확인 메일 다시 보내기
      </Button>
    </form>
  )
}
