import type { EmailOtpType } from '@supabase/supabase-js'
import { NextResponse, type NextRequest } from 'next/server'

import { createSupabaseServerClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl
  const tokenHash = searchParams.get('token_hash')
  const type = searchParams.get('type') as EmailOtpType | null
  const next = searchParams.get('next') ?? ''
  const isRecovery = type === 'recovery'

  const failureUrl = new URL(
    isRecovery
      ? '/forgot-password?error=expired'
      : '/signup/verify?error=expired',
    request.url,
  )

  if (!tokenHash || !type) {
    console.log(
      '[auth/confirm] token_hash/type 누락, 수신 쿼리:',
      request.nextUrl.search,
    )
    return NextResponse.redirect(failureUrl)
  }

  const supabase = await createSupabaseServerClient()
  const { error } = await supabase.auth.verifyOtp({
    type,
    token_hash: tokenHash,
  })
  if (error) {
    console.log('[auth/confirm] verifyOtp 실패:', error.code, error.message)
    return NextResponse.redirect(failureUrl)
  }

  const safeNext = next.startsWith('/') && !next.startsWith('//') ? next : null
  const destination = isRecovery ? '/reset-password' : (safeNext ?? '/home')
  return NextResponse.redirect(new URL(destination, request.url))
}
