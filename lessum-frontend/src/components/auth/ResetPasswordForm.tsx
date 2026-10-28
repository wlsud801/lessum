'use client'

import { useActionState } from 'react'

import { FormAlert } from '@/components/auth/FormAlert'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { updatePassword } from '@/lib/auth/actions'
import { MIN_PASSWORD_LENGTH } from '@/lib/auth/constants'

export function ResetPasswordForm() {
  const [state, formAction, isPending] = useActionState(updatePassword, {})

  return (
    <form action={formAction} className="flex flex-col gap-4">
      <FormAlert error={state.error} />
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="password">새 비밀번호</Label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          placeholder="새 비밀번호를 입력하세요"
          minLength={MIN_PASSWORD_LENGTH}
          required
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="passwordConfirm">새 비밀번호 확인</Label>
        <Input
          id="passwordConfirm"
          name="passwordConfirm"
          type="password"
          autoComplete="new-password"
          placeholder="같은 비밀번호를 다시 입력하세요"
          required
        />
      </div>
      <Button type="submit" size="lg" className="w-full" disabled={isPending}>
        변경하기
      </Button>
    </form>
  )
}
