import { env } from '../config/env.js'
import {
  buildCardRows,
  type CollectSettingsInput,
} from '../lib/collect-settings.js'
import { ApiError } from '../lib/errors.js'
import { supabaseAdmin } from '../lib/supabase.js'

const saveFailed = () =>
  new ApiError(
    500,
    'COLLECT_SETTINGS_SAVE_FAILED',
    '수집 설정을 저장하지 못했습니다. 다시 시도해주세요.',
  )

export async function saveCollectSettings(
  userId: string,
  input: CollectSettingsInput,
  today: string,
) {
  const existing = await supabaseAdmin
    .from('card_collect_settings')
    .select('issuer, statement_password_encrypted')
    .eq('user_id', userId)
  if (existing.error) {
    throw saveFailed()
  }

  const rows = buildCardRows(
    userId,
    input,
    existing.data,
    today,
    env.credentialEncryptionKey,
  )

  const upserted = await supabaseAdmin
    .from('card_collect_settings')
    .upsert(rows, { onConflict: 'user_id,issuer' })
  if (upserted.error) {
    throw saveFailed()
  }

  const removed = await supabaseAdmin
    .from('card_collect_settings')
    .delete()
    .eq('user_id', userId)
    .not('issuer', 'in', `(${input.cards.map((card) => card.issuer).join(',')})`)
  if (removed.error) {
    throw saveFailed()
  }

  const settings = await supabaseAdmin.from('collect_settings').upsert(
    {
      user_id: userId,
      mailbox_name: input.mailboxName,
      mailbox_imap_name: input.mailboxImapName,
      start_date: input.startDate,
    },
    { onConflict: 'user_id' },
  )
  if (settings.error) {
    throw saveFailed()
  }

  return rows.map((row) => ({
    issuer: row.issuer,
    arrival_day: row.arrival_is_month_end ? 'last' : row.arrival_day,
    next_collect_on: row.next_collect_on,
    has_statement_password: row.statement_password_encrypted !== null,
  }))
}
