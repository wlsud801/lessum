import { env } from '../config/env.js'
import { encryptSecret } from '../lib/crypto.js'
import { ApiError } from '../lib/errors.js'
import { supabaseAdmin } from '../lib/supabase.js'

export const PENDING_CONNECTION_TTL_MS = 30 * 60 * 1000

export const mailAppPasswordContext = (userId: string) =>
  `${userId}:mail-app-password`

export async function assertNotActivelyConnected(userId: string) {
  const { data, error } = await supabaseAdmin
    .from('mail_connections')
    .select('status')
    .eq('user_id', userId)
    .maybeSingle()

  if (error) {
    throw new ApiError(
      500,
      'MAIL_CONNECTION_LOAD_FAILED',
      '메일 연결 정보를 불러오지 못했습니다.',
    )
  }
  if (data?.status === 'active') {
    throw new ApiError(
      409,
      'MAIL_ALREADY_CONNECTED',
      '이미 메일이 연결되어 있습니다. 설정에서 연결을 해제한 뒤 다시 시도해주세요.',
    )
  }
}

export async function savePendingConnection(
  userId: string,
  email: string,
  appPassword: string,
) {
  const now = Date.now()
  const expiresAt = new Date(now + PENDING_CONNECTION_TTL_MS).toISOString()

  const { error } = await supabaseAdmin.from('mail_connections').upsert(
    {
      user_id: userId,
      provider: 'naver',
      email: email.toLowerCase(),
      app_password_encrypted: encryptSecret(
        env.credentialEncryptionKey,
        appPassword,
        mailAppPasswordContext(userId),
      ),
      status: 'pending',
      expires_at: expiresAt,
      verified_at: new Date(now).toISOString(),
    },
    { onConflict: 'user_id' },
  )

  if (error) {
    throw new ApiError(
      500,
      'MAIL_CONNECTION_SAVE_FAILED',
      '메일 연결 정보를 저장하지 못했습니다.',
    )
  }

  return { email: email.toLowerCase(), expires_at: expiresAt }
}
