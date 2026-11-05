'use server'

import { isAxiosError } from 'axios'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

import { getAccessToken } from '@/lib/auth/api'

import { postTransaction } from './api'
import type { AddTransactionState, CreateTransactionPayload } from './types'

export async function addTransaction(
  payload: CreateTransactionPayload,
): Promise<AddTransactionState> {
  const token = await getAccessToken()
  if (!token) {
    redirect('/login')
  }

  try {
    await postTransaction(token, payload)
  } catch (error) {
    if (isAxiosError(error) && error.response) {
      const data = error.response.data as { message?: string } | undefined
      return {
        error:
          data?.message ??
          '거래를 저장하지 못했습니다. 잠시 후 다시 시도해주세요.',
      }
    }
    return { error: '서버에 연결하지 못했습니다. 잠시 후 다시 시도해주세요.' }
  }

  revalidatePath('/transactions')
  return { success: true }
}
