import { env } from '../config/env.js'
import { CARD_ISSUERS, findCardIssuer } from '../lib/card-issuers.js'
import {
  buildCardRows,
  type CollectSettingsInput,
} from '../lib/collect-settings.js'
import { ApiError } from '../lib/errors.js'
import { supabaseAdmin } from '../lib/supabase.js'
import { getConnectionEmail } from './mail-connections.js'

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

export async function getCollectSummary(userId: string) {
  const email = await getConnectionEmail(userId)

  const [settings, cards] = await Promise.all([
    supabaseAdmin
      .from('collect_settings')
      .select('mailbox_name, start_date, auto_register_enabled')
      .eq('user_id', userId)
      .maybeSingle(),
    supabaseAdmin
      .from('card_collect_settings')
      .select('issuer, arrival_day, arrival_is_month_end, next_collect_on')
      .eq('user_id', userId)
      .eq('enabled', true),
  ])
  if (settings.error || cards.error) {
    throw new ApiError(
      500,
      'COLLECT_SETTINGS_LOAD_FAILED',
      '수집 설정을 불러오지 못했습니다. 잠시 후 다시 시도해주세요.',
    )
  }
  if (!settings.data || cards.data.length === 0) {
    throw new ApiError(
      404,
      'COLLECT_SETTINGS_REQUIRED',
      '수집 설정을 먼저 저장해주세요.',
    )
  }

  const issuerOrder = new Map(
    CARD_ISSUERS.map((itIssuer, index) => [itIssuer.id, index]),
  )
  const sortedCards = cards.data
    .map((itRow) => ({
      issuer: itRow.issuer,
      name: findCardIssuer(itRow.issuer)?.name ?? itRow.issuer,
      arrival_day: (itRow.arrival_is_month_end
        ? 'last'
        : itRow.arrival_day) as number | 'last',
      next_collect_on: itRow.next_collect_on as string | null,
    }))
    .sort(
      (a, b) =>
        (issuerOrder.get(a.issuer) ?? Number.MAX_SAFE_INTEGER) -
        (issuerOrder.get(b.issuer) ?? Number.MAX_SAFE_INTEGER),
    )

  const nextDates = sortedCards
    .map((itCard) => itCard.next_collect_on)
    .filter((itDate): itDate is string => itDate !== null)
    .sort()

  return {
    connection: { provider: 'naver', email },
    mailbox_name: settings.data.mailbox_name,
    start_date: settings.data.start_date,
    auto_register_enabled: settings.data.auto_register_enabled,
    cards: sortedCards,
    next_collect_on: nextDates[0] ?? null,
  }
}
