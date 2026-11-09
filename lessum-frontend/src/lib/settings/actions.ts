'use server'

import { isAxiosError } from 'axios'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

import { getAccessToken } from '@/lib/auth/api'
import {
  createCollectRun,
  disableAutoRegister,
  enableAutoRegister,
  getCollectRun,
} from '@/lib/onboarding/api'

export interface SettingsActionState {
  success?: boolean
  error?: string
}

export interface StartCollectState {
  runId?: string
  error?: string
}

export interface CollectRunState {
  status?: string
  statementsFound?: number
  error?: string
}

function errorMessage(error: unknown, fallback: string): string {
  if (isAxiosError(error) && error.response) {
    const data = error.response.data as { message?: string } | undefined
    return data?.message ?? fallback
  }
  return '서버에 연결하지 못했습니다. 잠시 후 다시 시도해주세요.'
}

async function requireToken(): Promise<string> {
  const token = await getAccessToken()
  if (!token) {
    redirect('/login')
  }
  return token
}

export async function setAutoCollect(
  enabled: boolean,
): Promise<SettingsActionState> {
  const token = await requireToken()

  try {
    if (enabled) {
      await enableAutoRegister(token)
    } else {
      await disableAutoRegister(token)
    }
  } catch (error) {
    return {
      error: errorMessage(
        error,
        enabled
          ? '자동 수집을 켜지 못했습니다. 잠시 후 다시 시도해주세요.'
          : '자동 수집을 끄지 못했습니다. 잠시 후 다시 시도해주세요.',
      ),
    }
  }

  revalidatePath('/settings/mail')
  revalidatePath('/settings')
  return { success: true }
}

export async function startManualCollect(): Promise<StartCollectState> {
  const token = await requireToken()

  try {
    const run = await createCollectRun(token)
    return { runId: run.run_id }
  } catch (error) {
    return {
      error: errorMessage(
        error,
        '새 메일 확인을 시작하지 못했습니다. 잠시 후 다시 시도해주세요.',
      ),
    }
  }
}

export async function checkCollectRun(
  runId: string,
): Promise<CollectRunState> {
  const token = await requireToken()

  try {
    const run = await getCollectRun(token, runId)
    return {
      status: run.status,
      statementsFound: run.totals.statements_found,
    }
  } catch (error) {
    return {
      error: errorMessage(
        error,
        '수집 상태를 확인하지 못했습니다. 잠시 후 다시 시도해주세요.',
      ),
    }
  }
}
