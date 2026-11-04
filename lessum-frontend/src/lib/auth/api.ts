import axios from 'axios'

import { createSupabaseServerClient } from '@/lib/supabase/server'

import type { MeResponse } from './types'

export async function getAccessToken(): Promise<string | null> {
  const supabase = await createSupabaseServerClient()
  const {
    data: { session },
  } = await supabase.auth.getSession()
  return session?.access_token ?? null
}

export async function getMe(accessToken?: string): Promise<MeResponse | null> {
  const token = accessToken ?? (await getAccessToken())
  if (!token) {
    return null
  }

  const { data } = await axios.get<MeResponse>(
    `${process.env.API_BASE_URL}/me`,
    { headers: { Authorization: `Bearer ${token}` } },
  )
  return data
}
