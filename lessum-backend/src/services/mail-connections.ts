import { env } from '../config/env.js'
import { decryptSecret, encryptSecret } from '../lib/crypto.js'
import { ApiError } from '../lib/errors.js'
import { supabaseAdmin } from '../lib/supabase.js'

export const PENDING_CONNECTION_TTL_MS = 30 * 60 * 1000

export const mailAppPasswordContext = (userId: string) =>
  `${userId}:mail-app-password`

async function loadConnection(userId: string) {
  const { data, error } = await supabaseAdmin
    .from('mail_connections')
    .select('email, app_password_encrypted, status, expires_at')
    .eq('user_id', userId)
    .maybeSingle()

  if (error) {
    throw new ApiError(
      500,
      'MAIL_CONNECTION_LOAD_FAILED',
      '메일 연결 정보를 불러오지 못했습니다.',
    )
  }
  if (!data) {
    throw new ApiError(
      404,
      'MAIL_NOT_CONNECTED',
      '연결된 메일이 없습니다. 메일 연결을 먼저 진행해주세요.',
    )
  }
  if (
    data.status === 'pending' &&
    data.expires_at &&
    new Date(data.expires_at).getTime() <= Date.now()
  ) {
    throw new ApiError(
      410,
      'MAIL_CONNECTION_EXPIRED',
      '메일 연결 확인 시간이 지났습니다. 메일 연결 단계에서 다시 확인해주세요.',
    )
  }
  return data
}

export async function assertConnectionUsable(userId: string) {
  await loadConnection(userId)
}

export async function getConnectionEmail(userId: string) {
  const connection = await loadConnection(userId)
  return connection.email
}

export async function getConnectionCredentials(userId: string) {
  const connection = await loadConnection(userId)

  try {
    return {
      email: connection.email,
      appPassword: decryptSecret(
        env.credentialEncryptionKey,
        connection.app_password_encrypted,
        mailAppPasswordContext(userId),
      ),
    }
  } catch {
    throw new ApiError(
      500,
      'MAIL_CREDENTIAL_UNREADABLE',
      '저장된 메일 연결 정보를 읽지 못했습니다. 메일 연결을 다시 진행해주세요.',
    )
  }
}

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
