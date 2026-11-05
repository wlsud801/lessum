import axios from 'axios'

import { getAccessToken } from '@/lib/auth/api'

import type {
  CreateTransactionPayload,
  PaymentMethodItem,
  TransactionItem,
  TransactionsResponse,
} from './types'

export async function getTransactions(
  month: string,
): Promise<TransactionsResponse | null> {
  const token = await getAccessToken()
  if (!token) {
    return null
  }

  const { data } = await axios.get<TransactionsResponse>(
    `${process.env.API_BASE_URL}/transactions`,
    {
      params: { month },
      headers: { Authorization: `Bearer ${token}` },
    },
  )
  return data
}

export async function getPaymentMethods(): Promise<PaymentMethodItem[]> {
  const token = await getAccessToken()
  if (!token) {
    return []
  }

  const { data } = await axios.get<PaymentMethodItem[]>(
    `${process.env.API_BASE_URL}/payment-methods`,
    { headers: { Authorization: `Bearer ${token}` } },
  )
  return data
}

export async function postTransaction(
  token: string,
  payload: CreateTransactionPayload,
): Promise<TransactionItem> {
  const { data } = await axios.post<TransactionItem>(
    `${process.env.API_BASE_URL}/transactions`,
    payload,
    { headers: { Authorization: `Bearer ${token}` } },
  )
  return data
}
