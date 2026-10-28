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
    return NextResponse.redirect(failureUrl)
  }

  const supabase = await createSupabaseServerClient()
  const { error } = await supabase.auth.verifyOtp({
    type,
    token_hash: tokenHash,
  })
  if (error) {
    return NextResponse.redirect(failureUrl)
  }

  const safeNext = next.startsWith('/') && !next.startsWith('//') ? next : null
  const destination = isRecovery ? '/reset-password' : (safeNext ?? '/home')
  return NextResponse.redirect(new URL(destination, request.url))
}
