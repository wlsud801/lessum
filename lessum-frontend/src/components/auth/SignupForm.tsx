'use client'

import Link from 'next/link'
import { useActionState } from 'react'

import { FormAlert } from '@/components/auth/FormAlert'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { signup } from '@/lib/auth/actions'
import { MIN_PASSWORD_LENGTH } from '@/lib/auth/constants'

export function SignupForm() {
  const [state, formAction, isPending] = useActionState(signup, {})
  const { fieldErrors } = state

  return (
    <form action={formAction} noValidate className="flex flex-col gap-4">
      <FormAlert error={state.error} />
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="email">이메일</Label>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          placeholder="email@example.com"
          defaultValue={state.values?.email}
          aria-invalid={!!fieldErrors?.email}
          aria-describedby={fieldErrors?.email ? 'email-error' : undefined}
          required
        />
        {fieldErrors?.email && (
          <p id="email-error" className="text-xs text-destructive">
            {fieldErrors.email}
          </p>
        )}
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="password">비밀번호</Label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          placeholder="비밀번호를 입력하세요"
          aria-invalid={!!fieldErrors?.password}
          aria-describedby={
            fieldErrors?.password ? 'password-error' : undefined
          }
          required
        />
        {fieldErrors?.password ? (
          <p id="password-error" className="text-xs text-destructive">
            {fieldErrors.password}
          </p>
        ) : (
          <p className="text-xs text-muted-foreground">
            {MIN_PASSWORD_LENGTH}자 이상 입력해주세요.
          </p>
        )}
      </div>
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="passwordConfirm">비밀번호 확인</Label>
        <Input
          id="passwordConfirm"
          name="passwordConfirm"
          type="password"
          autoComplete="new-password"
          placeholder="같은 비밀번호를 다시 입력하세요"
          aria-invalid={!!fieldErrors?.passwordConfirm}
          aria-describedby={
            fieldErrors?.passwordConfirm ? 'passwordConfirm-error' : undefined
          }
          required
        />
        {fieldErrors?.passwordConfirm && (
          <p id="passwordConfirm-error" className="text-xs text-destructive">
            {fieldErrors.passwordConfirm}
          </p>
        )}
      </div>
      <div className="flex flex-col gap-3 text-sm">
        <div className="flex items-center gap-2">
          <Checkbox id="terms" name="terms" value="agreed" required />
          <Label htmlFor="terms">
            [필수]
            <Link href="/terms" className="font-bold underline">
              이용약관
            </Link>
            에 동의합니다
          </Label>
        </div>
        <div className="flex items-center gap-2">
          <Checkbox id="privacy" name="privacy" value="agreed" required />
          <Label htmlFor="privacy">
            [필수]
            <Link href="/privacy" className="font-bold underline">
              개인정보 안내
            </Link>
            를 확인했습니다
          </Label>
        </div>
      </div>
      <Button
        type="submit"
        size="lg"
        className="w-[210px]"
        disabled={isPending}
      >
        가입하기
      </Button>
    </form>
  )
}
