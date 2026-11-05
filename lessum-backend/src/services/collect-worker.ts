import { ImapFlow } from 'imapflow'

import { env } from '../config/env.js'
import {
  nextCollectDate,
  todayInKst,
  type ArrivalDay,
} from '../lib/collect-schedule.js'
import { statementPasswordContext } from '../lib/collect-settings.js'
import { decryptSecret } from '../lib/crypto.js'
import { ApiError } from '../lib/errors.js'
import { decodeImapUtf7 } from '../lib/imap-utf7.js'
import { matchIssuerBySender } from '../lib/issuer-senders.js'
import { NAVER_IMAP_HOST, NAVER_IMAP_PORT } from '../lib/naver-imap.js'
import { StatementFormatError } from '../lib/statements/errors.js'
import { parseStatementEmail } from '../lib/statements/parse-statement-email.js'
import type { StatementResult } from '../lib/statements/statement.js'
import { supabaseAdmin } from '../lib/supabase.js'
import { getConnectionCredentials } from './mail-connections.js'

const MAX_MESSAGES_PER_CARD = 50

interface RunRow {
  id: string
  user_id: string
}

interface RunCardRow {
  id: string
  issuer: string
}

interface CardSettingRow {
  issuer: string
  arrival_day: number | null
  arrival_is_month_end: boolean
  statement_password_encrypted: string | null
  next_collect_on: string | null
}

interface MessageCandidate {
  uid: number
  messageId: string | null
}

interface CardOutcome {
  status: string
  statements_found: number
  rows_added: number
  rows_duplicated: number
  rows_review: number
  error_code: string | null
}

const STATUS_PRIORITY = [
  'error',
  'password_required',
  'online_statement_required',
  'unsupported_format',
  'needs_review',
  'parsed',
]

function worstStatus(current: string | null, next: string): string {
  if (current === null) {
    return next
  }
  return STATUS_PRIORITY.indexOf(next) < STATUS_PRIORITY.indexOf(current)
    ? next
    : current
}

function resultToCardStatus(status: StatementResult['status']): string {
  if (status === 'requires_online_statement') {
    return 'online_statement_required'
  }
  return status
}

function dayAfter(date: string): string {
  const next = new Date(`${date}T00:00:00Z`)
  next.setUTCDate(next.getUTCDate() + 1)
  return next.toISOString().slice(0, 10)
}

async function claimRun(runId: string): Promise<boolean> {
  const claimed = await supabaseAdmin
    .from('collect_runs')
    .update({ status: 'running', started_at: new Date().toISOString() })
    .eq('id', runId)
    .eq('status', 'queued')
    .select('id')
  return !claimed.error && claimed.data.length === 1
}

async function finishRun(
  runId: string,
  status: 'completed' | 'failed',
  errorCode: string | null = null,
): Promise<void> {
  await supabaseAdmin
    .from('collect_runs')
    .update({
      status,
      error_code: errorCode,
      finished_at: new Date().toISOString(),
    })
    .eq('id', runId)
}

async function createImportJob(userId: string): Promise<string> {
  const job = await supabaseAdmin
    .from('import_jobs')
    .insert({
      user_id: userId,
      source_type: 'EMAIL',
      status: 'running',
      started_at: new Date().toISOString(),
    })
    .select('id')
    .single()
  if (job.error) {
    throw new ApiError(
      500,
      'IMPORT_JOB_CREATE_FAILED',
      '수집 작업을 기록하지 못했습니다.',
    )
  }
  return job.data.id
}

async function finishImportJob(
  jobId: string | null,
  status: 'completed' | 'failed',
  errorCode: string | null = null,
): Promise<void> {
  if (!jobId) {
    return
  }
  await supabaseAdmin
    .from('import_jobs')
    .update({
      status,
      error_code: errorCode,
      finished_at: new Date().toISOString(),
    })
    .eq('id', jobId)
}

function readStatementPassword(
  userId: string,
  setting: CardSettingRow | undefined,
): string | null {
  if (!setting?.statement_password_encrypted) {
    return null
  }
  try {
    return decryptSecret(
      env.credentialEncryptionKey,
      setting.statement_password_encrypted,
      statementPasswordContext(userId, setting.issuer),
    )
  } catch {
    return null
  }
}

function monthStart(date: string): string {
  return `${date.slice(0, 7)}-01`
}

async function ensureCardPaymentMethod(
  userId: string,
  issuer: string,
): Promise<string | null> {
  const institution = await supabaseAdmin
    .from('financial_institutions')
    .select('id, name')
    .eq('code', `${issuer.toUpperCase()}_CARD`)
    .maybeSingle()
  if (institution.error || !institution.data) {
    return null
  }

  const existing = await supabaseAdmin
    .from('payment_methods')
    .select('id')
    .eq('user_id', userId)
    .eq('institution_id', institution.data.id)
    .is('archived_at', null)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()
  if (existing.data) {
    return existing.data.id
  }

  const created = await supabaseAdmin
    .from('payment_methods')
    .insert({
      user_id: userId,
      method_type: 'CARD',
      institution_id: institution.data.id,
      nickname: institution.data.name,
    })
    .select('id')
    .single()
  return created.error ? null : created.data.id
}

async function saveStatement(
  userId: string,
  issuer: string,
  uidValidity: number,
  candidate: MessageCandidate,
  result: StatementResult,
  jobId: string,
  paymentMethodId: string | null,
): Promise<{ added: number; duplicated: number; review: number }> {
  const inserted = await supabaseAdmin
    .from('statements')
    .insert({
      user_id: userId,
      issuer,
      imap_uidvalidity: uidValidity,
      imap_uid: candidate.uid,
      message_id: candidate.messageId,
      attachment_sha256: result.attachment_sha256,
      payment_date: result.context?.payment_date ?? null,
      validation: result.validation ?? null,
    })
    .select('id')
    .single()

  if (inserted.error) {
    if (inserted.error.code === '23505') {
      return { added: 0, duplicated: result.transactions.length, review: 0 }
    }
    throw new ApiError(
      500,
      'STATEMENT_SAVE_FAILED',
      '명세서를 저장하지 못했습니다.',
    )
  }

  if (result.transactions.length === 0) {
    return { added: 0, duplicated: 0, review: 0 }
  }

  const paymentDate = result.context?.payment_date ?? null

  const transactionRows = result.transactions.map((itRow) => {
    const isInstallment = (itRow.installment_months ?? 0) >= 2
    const memo = [
      !itRow.transaction_date && itRow.raw_date
        ? `명세서 날짜 ${itRow.raw_date}`
        : null,
      itRow.kind === 'adjustment_reference' ? '명세서 조정 참고 행' : null,
    ]
      .filter((itNote) => itNote !== null)
      .join(' · ')
    return {
      user_id: userId,
      transaction_date: itRow.transaction_date || null,
      transaction_type:
        itRow.kind === 'refund' ? 'EXPENSE_REFUND' : 'CARD_EXPENSE',
      merchant_name: itRow.merchant ? itRow.merchant.slice(0, 100) : null,
      amount: itRow.amount_krw ? Math.abs(itRow.amount_krw) : null,
      payment_method_id: paymentMethodId,
      source_type: 'EMAIL',
      payment_plan: isInstallment ? 'INSTALLMENT' : 'UNKNOWN',
      installment_months: isInstallment ? itRow.installment_months : null,
      memo: memo || null,
    }
  })

  const insertedTransactions = await supabaseAdmin
    .from('transactions')
    .insert(transactionRows)
    .select('id')
  if (insertedTransactions.error) {
    throw new ApiError(
      500,
      'TRANSACTIONS_SAVE_FAILED',
      '거래 내역을 저장하지 못했습니다.',
    )
  }

  const reviewRows: Record<string, unknown>[] = []
  const chargeRows: Record<string, unknown>[] = []
  const itemRows: Record<string, unknown>[] = []
  result.transactions.forEach((itRow, index) => {
    const transactionId = insertedTransactions.data[index].id
    for (const itReason of itRow.review_reasons) {
      reviewRows.push({
        user_id: userId,
        transaction_id: transactionId,
        reason: itReason,
      })
    }
    if (itRow.installment_round) {
      const billed = itRow.billed_amount_krw ?? itRow.billed_principal_krw
      chargeRows.push({
        user_id: userId,
        transaction_id: transactionId,
        installment_no: itRow.installment_round,
        billing_month: monthStart(
          paymentDate ?? (itRow.transaction_date || todayInKst()),
        ),
        billed_amount: billed ? Math.abs(billed) : null,
      })
    }
    itemRows.push({
      user_id: userId,
      job_id: jobId,
      transaction_id: transactionId,
      source_namespace: `email:${issuer}`,
      source_item_key: `${result.attachment_sha256}:${itRow.source_row_id ?? `row_${index}`}`,
      extracted_date: itRow.transaction_date || itRow.raw_date || null,
      extracted_merchant: itRow.merchant || null,
      extracted_amount_krw: itRow.amount_krw,
    })
  })

  const saves = await Promise.all([
    reviewRows.length > 0
      ? supabaseAdmin.from('transaction_reviews').insert(reviewRows)
      : null,
    chargeRows.length > 0
      ? supabaseAdmin.from('installment_charges').insert(chargeRows)
      : null,
    supabaseAdmin.from('import_items').upsert(itemRows, {
      onConflict: 'user_id,source_namespace,source_item_key',
      ignoreDuplicates: true,
    }),
  ])
  if (saves.some((itSave) => itSave?.error)) {
    throw new ApiError(
      500,
      'TRANSACTION_DETAILS_SAVE_FAILED',
      '거래 부가 정보를 저장하지 못했습니다.',
    )
  }

  return {
    added: transactionRows.length,
    duplicated: 0,
    review: result.transactions.filter((itRow) => itRow.requires_review)
      .length,
  }
}

async function collectCard(
  client: ImapFlow,
  run: RunRow,
  issuer: string,
  candidates: MessageCandidate[],
  uidValidity: number,
  setting: CardSettingRow | undefined,
  jobId: string,
): Promise<CardOutcome> {
  const outcome: CardOutcome = {
    status: 'not_found',
    statements_found: 0,
    rows_added: 0,
    rows_duplicated: 0,
    rows_review: 0,
    error_code: null,
  }
  if (candidates.length === 0) {
    return outcome
  }

  const limited = candidates.slice(-MAX_MESSAGES_PER_CARD)
  const existing = await supabaseAdmin
    .from('statements')
    .select('imap_uid')
    .eq('user_id', run.user_id)
    .eq('issuer', issuer)
    .eq('imap_uidvalidity', uidValidity)
    .in(
      'imap_uid',
      limited.map((itCandidate) => itCandidate.uid),
    )
  if (existing.error) {
    throw new ApiError(
      500,
      'STATEMENT_LOOKUP_FAILED',
      '수집 이력을 확인하지 못했습니다.',
    )
  }
  const known = new Set(existing.data.map((itRow) => Number(itRow.imap_uid)))
  const password = readStatementPassword(run.user_id, setting)
  const paymentMethodId = await ensureCardPaymentMethod(run.user_id, issuer)

  let worst: string | null = null
  let sawFormatError = false

  for (const candidate of limited) {
    if (known.has(candidate.uid)) {
      continue
    }

    const message = await client.fetchOne(
      String(candidate.uid),
      { source: true },
      { uid: true },
    )
    if (!message || !message.source) {
      continue
    }

    let result: StatementResult
    try {
      result = await parseStatementEmail(message.source, issuer, password)
    } catch (error) {
      if (error instanceof StatementFormatError) {
        sawFormatError = true
        continue
      }
      console.error(`collect card parse failed: ${issuer}`, error)
      worst = worstStatus(worst, 'error')
      outcome.error_code = 'STATEMENT_PARSE_FAILED'
      continue
    }

    outcome.statements_found += 1
    worst = worstStatus(worst, resultToCardStatus(result.status))

    if (result.status === 'parsed' || result.status === 'needs_review') {
      const saved = await saveStatement(
        run.user_id,
        issuer,
        uidValidity,
        candidate,
        result,
        jobId,
        paymentMethodId,
      )
      outcome.rows_added += saved.added
      outcome.rows_duplicated += saved.duplicated
      outcome.rows_review += saved.review
    }
  }

  if (worst !== null) {
    outcome.status = worst
  } else if (sawFormatError) {
    outcome.status = 'unsupported_format'
    outcome.error_code = 'UNSUPPORTED_FORMAT'
  }
  return outcome
}

async function advanceCardSchedule(
  userId: string,
  setting: CardSettingRow | undefined,
): Promise<void> {
  if (!setting) {
    return
  }

  const today = todayInKst()
  const updates: Record<string, unknown> = {
    last_collected_at: new Date().toISOString(),
  }
  if (setting.next_collect_on && setting.next_collect_on <= today) {
    const arrival: ArrivalDay = setting.arrival_is_month_end
      ? 'last'
      : (setting.arrival_day as number)
    updates.next_collect_on = nextCollectDate(arrival, dayAfter(today))
  }

  await supabaseAdmin
    .from('card_collect_settings')
    .update(updates)
    .eq('user_id', userId)
    .eq('issuer', setting.issuer)
}

async function collectWithImap(
  run: RunRow,
  mailboxImapName: string,
  startDate: string,
  runCards: RunCardRow[],
  settingsByIssuer: Map<string, CardSettingRow>,
  credentials: { email: string; appPassword: string },
  jobId: string,
): Promise<void> {
  const client = new ImapFlow({
    host: NAVER_IMAP_HOST,
    port: NAVER_IMAP_PORT,
    secure: true,
    auth: { user: credentials.email, pass: credentials.appPassword },
    logger: false,
    connectionTimeout: 25_000,
    greetingTimeout: 15_000,
    socketTimeout: 120_000,
  })
  client.on('error', () => undefined)

  await client.connect()
  try {
    const lock = await client.getMailboxLock(decodeImapUtf7(mailboxImapName), {
      readOnly: true,
    })
    try {
      const mailbox = typeof client.mailbox === 'object' ? client.mailbox : null
      const uidValidity = Number(mailbox?.uidValidity ?? 0)

      const uids = await client.search(
        { since: new Date(`${startDate}T00:00:00+09:00`) },
        { uid: true },
      )

      const byIssuer = new Map<string, MessageCandidate[]>()
      if (Array.isArray(uids) && uids.length > 0) {
        for await (const message of client.fetch(
          uids,
          { envelope: true, uid: true },
          { uid: true },
        )) {
          const issuer = matchIssuerBySender(
            message.envelope?.from?.[0]?.address,
          )
          if (!issuer) {
            continue
          }
          const list = byIssuer.get(issuer) ?? []
          list.push({
            uid: message.uid,
            messageId: message.envelope?.messageId ?? null,
          })
          byIssuer.set(issuer, list)
        }
      }

      for (const card of runCards) {
        const setting = settingsByIssuer.get(card.issuer)
        const outcome = await collectCard(
          client,
          run,
          card.issuer,
          byIssuer.get(card.issuer) ?? [],
          uidValidity,
          setting,
          jobId,
        )
        await supabaseAdmin
          .from('collect_run_cards')
          .update({ ...outcome, updated_at: new Date().toISOString() })
          .eq('id', card.id)
        await advanceCardSchedule(run.user_id, setting)
      }
    } finally {
      lock.release()
    }
  } finally {
    await client.logout().catch(() => client.close())
  }
}

async function processRun(run: RunRow): Promise<void> {
  if (!(await claimRun(run.id))) {
    return
  }

  let jobId: string | null = null
  try {
    jobId = await createImportJob(run.user_id)
    const [settings, runCards, cardSettings] = await Promise.all([
      supabaseAdmin
        .from('collect_settings')
        .select('mailbox_imap_name, start_date')
        .eq('user_id', run.user_id)
        .maybeSingle(),
      supabaseAdmin
        .from('collect_run_cards')
        .select('id, issuer')
        .eq('run_id', run.id)
        .eq('status', 'queued'),
      supabaseAdmin
        .from('card_collect_settings')
        .select(
          'issuer, arrival_day, arrival_is_month_end, statement_password_encrypted, next_collect_on',
        )
        .eq('user_id', run.user_id)
        .eq('enabled', true),
    ])
    if (settings.error || runCards.error || cardSettings.error) {
      throw new ApiError(
        500,
        'COLLECT_RUN_LOAD_FAILED',
        '수집 작업 정보를 불러오지 못했습니다.',
      )
    }
    if (!settings.data) {
      throw new ApiError(
        409,
        'COLLECT_SETTINGS_REQUIRED',
        '수집 설정을 먼저 저장해주세요.',
      )
    }

    if (runCards.data.length > 0) {
      const credentials = await getConnectionCredentials(run.user_id)
      const settingsByIssuer = new Map(
        cardSettings.data.map((itRow) => [itRow.issuer, itRow]),
      )
      await collectWithImap(
        run,
        settings.data.mailbox_imap_name,
        settings.data.start_date,
        runCards.data,
        settingsByIssuer,
        credentials,
        jobId,
      )
    }

    await finishRun(run.id, 'completed')
    await finishImportJob(jobId, 'completed')
  } catch (error) {
    const mailboxMissing =
      typeof error === 'object' &&
      error !== null &&
      (error as { mailboxMissing?: boolean }).mailboxMissing === true
    const code =
      error instanceof ApiError
        ? error.code
        : mailboxMissing
          ? 'MAILBOX_NOT_FOUND'
          : 'COLLECT_RUN_FAILED'
    console.error(`collect run failed: ${run.id}`, error)
    await supabaseAdmin
      .from('collect_run_cards')
      .update({ status: 'error', error_code: code })
      .eq('run_id', run.id)
      .eq('status', 'queued')
    await finishRun(run.id, 'failed', code)
    await finishImportJob(jobId, 'failed', code)
  }
}

export async function processQueuedRuns(): Promise<void> {
  const runs = await supabaseAdmin
    .from('collect_runs')
    .select('id, user_id')
    .eq('status', 'queued')
    .order('created_at', { ascending: true })
  if (runs.error) {
    console.error('queued collect runs lookup failed', runs.error)
    return
  }

  for (const run of runs.data) {
    await processRun(run)
  }
}
