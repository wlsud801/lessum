'use client'

import { useActionState } from 'react'

import { FormAlert } from '@/components/auth/FormAlert'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { login } from '@/lib/auth/actions'

interface LoginFormProps {
  next?: string
  isPasswordReset?: boolean
}

export function LoginForm({ next, isPasswordReset }: LoginFormProps) {
  const [state, formAction, isPending] = useActionState(login, {})

  return (
    <form action={formAction} className="flex flex-col gap-4">
      {isPasswordReset && (
        <FormAlert message="비밀번호가 변경되었습니다. 새 비밀번호로 로그인해주세요." />
      )}
      <FormAlert error={state.error} />
      {next && <input type="hidden" name="next" value={next} />}
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="email">이메일</Label>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          placeholder="이메일을 입력하세요"
          required
        />
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="password">비밀번호</Label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="current-password"
          placeholder="비밀번호를 입력하세요"
          required
        />
      </div>
      <Button type="submit" size="lg" className="w-full" disabled={isPending}>
        로그인
      </Button>
    </form>
  )
}
