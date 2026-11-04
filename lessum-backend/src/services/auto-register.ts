import {
  MAIL_CREDENTIAL_STORAGE_CONSENT_VERSION,
  buildNextDates,
  earliestDate,
} from '../lib/auto-register.js'
import { ApiError } from '../lib/errors.js'
import { supabaseAdmin } from '../lib/supabase.js'
import { assertConnectionUsable } from './mail-connections.js'

const RPC_ERRORS: Record<string, ApiError> = {
  COLLECT_SETTINGS_REQUIRED: new ApiError(
    409,
    'COLLECT_SETTINGS_REQUIRED',
    '수집 설정을 먼저 저장해주세요.',
  ),
  CARD_SETTINGS_REQUIRED: new ApiError(
    409,
    'CARD_SETTINGS_REQUIRED',
    '명세서를 가져올 카드사를 먼저 선택해주세요.',
  ),
  MAIL_CONNECTION_REQUIRED: new ApiError(
    410,
    'MAIL_CONNECTION_EXPIRED',
    '메일 연결 확인 시간이 지났거나 연결이 없습니다. 메일 연결 단계에서 다시 확인해주세요.',
  ),
}

function mapRpcError(error: { message: string }, fallback: ApiError) {
  return RPC_ERRORS[error.message] ?? fallback
}

const enableFailed = () =>
  new ApiError(
    500,
    'AUTO_REGISTER_FAILED',
    '자동 등록을 켜지 못했습니다. 잠시 후 다시 시도해주세요.',
  )

export async function enableAutoRegister(userId: string, today: string) {
  await assertConnectionUsable(userId)

  const cards = await supabaseAdmin
    .from('card_collect_settings')
    .select('issuer, arrival_day, arrival_is_month_end')
    .eq('user_id', userId)
    .eq('enabled', true)
  if (cards.error) {
    throw enableFailed()
  }
  if (cards.data.length === 0) {
    throw RPC_ERRORS.CARD_SETTINGS_REQUIRED
  }

  const nextDates = buildNextDates(cards.data, today)
  const { data, error } = await supabaseAdmin.rpc('enable_auto_register', {
    p_user_id: userId,
    p_consent_version: MAIL_CREDENTIAL_STORAGE_CONSENT_VERSION,
    p_next_dates: nextDates,
  })
  if (error) {
    throw mapRpcError(error, enableFailed())
  }

  return {
    auto_register_enabled: true,
    run_id: data as string,
    next_collect_on: earliestDate(nextDates),
    cards: Object.entries(nextDates).map(([issuer, next_collect_on]) => ({
      issuer,
      next_collect_on,
    })),
  }
}

export async function disableAutoRegister(userId: string) {
  const { error } = await supabaseAdmin.rpc('disable_auto_register', {
    p_user_id: userId,
  })
  if (error) {
    throw new ApiError(
      500,
      'AUTO_REGISTER_DISABLE_FAILED',
      '자동 등록을 끄지 못했습니다. 잠시 후 다시 시도해주세요.',
    )
  }
}

export async function disconnectMail(userId: string) {
  const { error } = await supabaseAdmin.rpc('disconnect_mail', {
    p_user_id: userId,
  })
  if (error) {
    throw new ApiError(
      500,
      'MAIL_DISCONNECT_FAILED',
      '메일 연결을 해제하지 못했습니다. 잠시 후 다시 시도해주세요.',
    )
  }
}
