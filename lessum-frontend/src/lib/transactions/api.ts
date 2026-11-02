import axios from 'axios'

import { getAccessToken } from '@/lib/auth/api'

import type { TransactionsResponse } from './types'

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
