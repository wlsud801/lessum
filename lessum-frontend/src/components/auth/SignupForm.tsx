'use client'

import Link from 'next/link'
import { useActionState, useState } from 'react'

import { FormAlert } from '@/components/auth/FormAlert'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useDebouncedValue } from '@/hooks/use-debounced-value'
import { signup } from '@/lib/auth/actions'
import { MIN_PASSWORD_LENGTH } from '@/lib/auth/constants'
import {
  validateEmail,
  validatePassword,
  validatePasswordConfirm,
} from '@/lib/auth/validation'

interface FormValues {
  email: string
  password: string
  passwordConfirm: string
}

export function SignupForm() {
  const [state, formAction, isPending] = useActionState(signup, {})
  const [values, setValues] = useState<FormValues>({
    email: '',
    password: '',
    passwordConfirm: '',
  })
  const [submitted, setSubmitted] = useState<FormValues | null>(null)

  const debounced = useDebouncedValue(values)

  const handleChange =
    (field: keyof FormValues) => (event: React.ChangeEvent<HTMLInputElement>) =>
      setValues((prev) => ({ ...prev, [field]: event.target.value }))

  const handleAction = (formData: FormData) => {
    setSubmitted(values)
    formAction(formData)
  }

  const getServerError = (field: keyof FormValues) =>
    submitted && submitted[field] === values[field]
      ? state.fieldErrors?.[field]
      : undefined

  const emailError =
    (debounced.email ? validateEmail(debounced.email) : undefined) ??
    getServerError('email')
  const passwordError =
    (debounced.password ? validatePassword(debounced.password) : undefined) ??
    getServerError('password')
  const passwordConfirmError =
    (debounced.passwordConfirm
      ? validatePasswordConfirm(debounced.password, debounced.passwordConfirm)
      : undefined) ?? getServerError('passwordConfirm')

  return (
    <form action={handleAction} noValidate className="flex flex-col gap-4">
      <FormAlert error={state.error} />
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="email">이메일</Label>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          placeholder="email@example.com"
          value={values.email}
          onChange={handleChange('email')}
          aria-invalid={!!emailError}
          aria-describedby={emailError ? 'email-error' : undefined}
          required
        />
        {emailError && (
          <p id="email-error" className="text-xs text-destructive">
            {emailError}
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
          value={values.password}
          onChange={handleChange('password')}
          aria-invalid={!!passwordError}
          aria-describedby={passwordError ? 'password-error' : undefined}
          required
        />
        {passwordError ? (
          <p id="password-error" className="text-xs text-destructive">
            {passwordError}
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
          value={values.passwordConfirm}
          onChange={handleChange('passwordConfirm')}
          aria-invalid={!!passwordConfirmError}
          aria-describedby={
            passwordConfirmError ? 'passwordConfirm-error' : undefined
          }
          required
        />
        {passwordConfirmError && (
          <p id="passwordConfirm-error" className="text-xs text-destructive">
            {passwordConfirmError}
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
      <Button type="submit" size="lg" className="w-52.5" disabled={isPending}>
        가입하기
      </Button>
    </form>
  )
}
