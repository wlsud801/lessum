'use server'

import { headers } from 'next/headers'
import { redirect } from 'next/navigation'

import { createSupabaseServerClient } from '@/lib/supabase/server'

import {
  MIN_PASSWORD_LENGTH,
  PRIVACY_VERSION,
  TERMS_VERSION,
} from './constants'
import type { AuthActionState } from './types'

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

function getString(formData: FormData, key: string) {
  const value = formData.get(key)
  return typeof value === 'string' ? value.trim() : ''
}

function getSafeNextPath(formData: FormData) {
  const next = getString(formData, 'next')
  return next.startsWith('/') && !next.startsWith('//') ? next : '/home'
}

async function getOrigin() {
  const requestHeaders = await headers()
  const host =
    requestHeaders.get('x-forwarded-host') ?? requestHeaders.get('host')
  const protocol = requestHeaders.get('x-forwarded-proto') ?? 'http'
  return `${protocol}://${host}`
}

function validatePassword(password: string) {
  if (password.length < MIN_PASSWORD_LENGTH) {
    return `비밀번호는 ${MIN_PASSWORD_LENGTH}자 이상이어야 합니다.`
  }
  return undefined
}

export async function login(
  _prev: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const email = getString(formData, 'email')
  const password = String(formData.get('password') ?? '')

  if (!EMAIL_PATTERN.test(email) || !password) {
    return { error: '이메일과 비밀번호를 입력해주세요.' }
  }

  const supabase = await createSupabaseServerClient()
  const { error } = await supabase.auth.signInWithPassword({ email, password })

  if (error) {
    if (error.code === 'email_not_confirmed') {
      redirect(`/signup/verify?email=${encodeURIComponent(email)}`)
    }
    return { error: '이메일 또는 비밀번호가 올바르지 않습니다.' }
  }

  redirect(getSafeNextPath(formData))
}

export async function signup(
  _prev: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const email = getString(formData, 'email')
  const password = String(formData.get('password') ?? '')
  const passwordConfirm = String(formData.get('passwordConfirm') ?? '')

  if (!EMAIL_PATTERN.test(email)) {
    return { error: '올바른 이메일을 입력해주세요.' }
  }
  const passwordError = validatePassword(password)
  if (passwordError) {
    return { error: passwordError }
  }
  if (password !== passwordConfirm) {
    return { error: '비밀번호 확인이 일치하지 않습니다.' }
  }
  if (!formData.get('terms') || !formData.get('privacy')) {
    return { error: '필수 약관에 모두 동의해주세요.' }
  }

  const supabase = await createSupabaseServerClient()
  const { error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      emailRedirectTo: `${await getOrigin()}/auth/confirm`,
      data: { terms_version: TERMS_VERSION, privacy_version: PRIVACY_VERSION },
    },
  })

  if (error) {
    if (error.code === 'weak_password') {
      return { error: '비밀번호 정책을 만족하지 않습니다.' }
    }
    if (error.code === 'over_email_send_rate_limit') {
      return { error: '요청이 너무 많습니다. 잠시 후 다시 시도해주세요.' }
    }
    return { error: '가입에 실패했습니다. 잠시 후 다시 시도해주세요.' }
  }

  redirect(`/signup/verify?email=${encodeURIComponent(email)}`)
}

export async function resendConfirmation(
  _prev: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const email = getString(formData, 'email')
  if (!EMAIL_PATTERN.test(email)) {
    return { error: '이메일 정보를 확인할 수 없습니다. 다시 가입해주세요.' }
  }

  const supabase = await createSupabaseServerClient()
  const { error } = await supabase.auth.resend({
    type: 'signup',
    email,
    options: { emailRedirectTo: `${await getOrigin()}/auth/confirm` },
  })

  if (error) {
    return {
      error:
        '잠시 후 다시 시도해주세요. 재전송은 일정 시간이 지나야 가능합니다.',
    }
  }
  return { message: '확인 메일을 다시 보냈습니다.' }
}

export async function requestPasswordReset(
  _prev: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const email = getString(formData, 'email')
  if (!EMAIL_PATTERN.test(email)) {
    return { error: '올바른 이메일을 입력해주세요.' }
  }

  const supabase = await createSupabaseServerClient()
  await supabase.auth.resetPasswordForEmail(email)

  return { message: '등록된 이메일이라면 재설정 안내가 발송됩니다.' }
}

export async function updatePassword(
  _prev: AuthActionState,
  formData: FormData,
): Promise<AuthActionState> {
  const password = String(formData.get('password') ?? '')
  const passwordConfirm = String(formData.get('passwordConfirm') ?? '')

  const passwordError = validatePassword(password)
  if (passwordError) {
    return { error: passwordError }
  }
  if (password !== passwordConfirm) {
    return { error: '비밀번호 확인이 일치하지 않습니다.' }
  }

  const supabase = await createSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) {
    redirect('/forgot-password?error=expired')
  }

  const { error } = await supabase.auth.updateUser({ password })
  if (error) {
    if (error.code === 'weak_password') {
      return { error: '비밀번호 정책을 만족하지 않습니다.' }
    }
    if (error.code === 'same_password') {
      return { error: '이전과 다른 비밀번호를 입력해주세요.' }
    }
    return { error: '비밀번호를 변경하지 못했습니다. 다시 시도해주세요.' }
  }

  await supabase.auth.signOut()
  redirect('/login?reset=success')
}

export async function logout() {
  const supabase = await createSupabaseServerClient()
  await supabase.auth.signOut()
  redirect('/login')
}
