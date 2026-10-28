'use client'

import { useActionState } from 'react'

import { FormAlert } from '@/components/auth/FormAlert'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { requestPasswordReset } from '@/lib/auth/actions'

export function ForgotPasswordForm() {
  const [state, formAction, isPending] = useActionState(
    requestPasswordReset,
    {},
  )

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <FormAlert error={state.error} message={state.message} />
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="email">이메일</Label>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          placeholder="가입 이메일을 입력하세요"
          required
        />
      </div>
      <Button type="submit" size="lg" className="w-full" disabled={isPending}>
        재설정 링크 받기
      </Button>
    </form>
  )
}
