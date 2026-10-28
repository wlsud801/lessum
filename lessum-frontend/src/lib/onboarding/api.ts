import axios from 'axios'

import { getAccessToken } from '@/lib/auth/api'

export async function completeOnboarding(): Promise<void> {
  const token = await getAccessToken()
  if (!token) {
    return
  }

  await axios.post(
    `${process.env.API_BASE_URL}/me/onboarding/complete`,
    undefined,
    { headers: { Authorization: `Bearer ${token}` } },
  )
}
