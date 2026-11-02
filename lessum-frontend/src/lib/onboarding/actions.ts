'use server'

import { isAxiosError } from 'axios'
import { redirect } from 'next/navigation'

import { getAccessToken } from '@/lib/auth/api'

import {
  completeOnboarding,
  enableAutoRegister as requestEnableAutoRegister,
  saveCollectSettings as requestSaveCollectSettings,
  verifyMailConnection,
} from './api'
import type { CollectSettingsPayload, OnboardingActionState } from './types'

export async function finishOnboarding() {
  await completeOnboarding()
  redirect('/home')
}

export async function connectNaverMail(
  _prev: OnboardingActionState,
  formData: FormData,
): Promise<OnboardingActionState> {
  const email = String(formData.get('naverEmail') ?? '').trim()
  const appPassword = String(formData.get('appPassword') ?? '')

  if (!email || !appPassword) {
    return { error: '네이버 이메일과 앱 비밀번호를 입력해주세요.' }
  }

  const token = await getAccessToken()
  if (!token) {
    redirect('/login')
  }

  try {
    await verifyMailConnection(token, email, appPassword)
  } catch (error) {
    if (isAxiosError(error) && error.response) {
      const data = error.response.data as { message?: string } | undefined
      return {
        error:
          data?.message ??
          '메일 연결에 실패했습니다. 잠시 후 다시 시도해주세요.',
      }
    }
    return {
      error: '메일 서버에 연결하지 못했습니다. 잠시 후 다시 시도해주세요.',
    }
  }

  redirect('/onboarding/collect')
}

export async function saveCollectSettings(
  _prev: OnboardingActionState,
  payload: CollectSettingsPayload,
): Promise<OnboardingActionState> {
  if (payload.cards.length === 0) {
    return { error: '명세서를 가져올 카드사를 선택해주세요.' }
  }

  const token = await getAccessToken()
  if (!token) {
    redirect('/login')
  }

  try {
    await requestSaveCollectSettings(token, payload)
  } catch (error) {
    if (isAxiosError(error) && error.response) {
      const data = error.response.data as { message?: string } | undefined
      return {
        error:
          data?.message ??
          '수집 설정을 저장하지 못했습니다. 잠시 후 다시 시도해주세요.',
      }
    }
    return {
      error: '수집 설정을 저장하지 못했습니다. 잠시 후 다시 시도해주세요.',
    }
  }

  redirect('/onboarding/auto-register')
}

export async function enableAutoRegister(
  _prev: OnboardingActionState,
  formData: FormData,
): Promise<OnboardingActionState> {
  if (formData.get('storageConsent') === null) {
    return { error: '자동 등록에 필요한 정보 보관에 동의해주세요.' }
  }

  const token = await getAccessToken()
  if (!token) {
    redirect('/login')
  }

  try {
    await requestEnableAutoRegister(token)
  } catch (error) {
    if (isAxiosError(error) && error.response) {
      const data = error.response.data as { message?: string } | undefined
      return {
        error:
          data?.message ??
          '자동 등록을 켜지 못했습니다. 잠시 후 다시 시도해주세요.',
      }
    }
    return {
      error: '자동 등록을 켜지 못했습니다. 잠시 후 다시 시도해주세요.',
    }
  }

  redirect('/onboarding/result')
}
