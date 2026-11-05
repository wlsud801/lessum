'use server'

import { isAxiosError } from 'axios'
import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

import { getAccessToken } from '@/lib/auth/api'

import {
  deleteTransaction,
  patchTransaction,
  postTransaction,
} from './api'
import type {
  AddTransactionState,
  CreateTransactionPayload,
  UpdateTransactionPayload,
} from './types'

function toErrorState(error: unknown): AddTransactionState {
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

async function requireToken(): Promise<string> {
  const token = await getAccessToken()
  if (!token) {
    redirect('/login')
  }
  return token
}

export async function addTransaction(
  payload: CreateTransactionPayload,
): Promise<AddTransactionState> {
  const token = await requireToken()

  try {
    await postTransaction(token, payload)
  } catch (error) {
    return toErrorState(error)
  }

  revalidatePath('/transactions')
  return { success: true }
}

export async function updateTransaction(
  transactionId: string,
  payload: UpdateTransactionPayload,
): Promise<AddTransactionState> {
  const token = await requireToken()

  try {
    await patchTransaction(token, transactionId, payload)
  } catch (error) {
    return toErrorState(error)
  }

  revalidatePath('/transactions')
  return { success: true }
}

export async function removeTransaction(
  transactionId: string,
): Promise<AddTransactionState> {
  const token = await requireToken()

  try {
    await deleteTransaction(token, transactionId)
  } catch (error) {
    if (isAxiosError(error) && error.response) {
      const data = error.response.data as { message?: string } | undefined
      return { error: data?.message ?? '거래를 삭제하지 못했습니다.' }
    }
    return { error: '서버에 연결하지 못했습니다. 잠시 후 다시 시도해주세요.' }
  }

  revalidatePath('/transactions')
  return { success: true }
}
