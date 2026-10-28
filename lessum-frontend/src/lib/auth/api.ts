import axios from 'axios'

import { createSupabaseServerClient } from '@/lib/supabase/server'

import type { MeResponse } from './types'

export async function getMe(): Promise<MeResponse | null> {
  const supabase = await createSupabaseServerClient()
  const {
    data: { session },
  } = await supabase.auth.getSession()
  if (!session) {
    return null
  }

  const { data } = await axios.get<MeResponse>(
    `${process.env.API_BASE_URL}/me`,
    { headers: { Authorization: `Bearer ${session.access_token}` } },
  )
  return data
}
