import { CARD_ISSUERS, findCardIssuer } from '../lib/card-issuers.js'
import { ApiError } from '../lib/errors.js'
import {
  MANUAL_COLLECT_DAILY_LIMIT,
  isManualDailyLimitReached,
  isManualRunTooSoon,
  manualCollectDayStart,
} from '../lib/manual-collect.js'
import { supabaseAdmin } from '../lib/supabase.js'
import { kickCollectWorker } from './collect-scheduler.js'
import { assertConnectionUsable } from './mail-connections.js'

export interface CollectRunCardResult {
  issuer: string
  name: string
  status: string
  statements_found: number
  rows_added: number
  rows_duplicated: number
  rows_review: number
  error_code: string | null
}

export interface LatestCollectRun {
  run_id: string
  trigger: string
  status: string
  error_code: string | null
  created_at: string
  finished_at: string | null
  totals: {
    statements_found: number
    rows_added: number
    rows_duplicated: number
    rows_review: number
  }
  cards: CollectRunCardResult[]
  next_collect_on: string | null
}

export interface ManualCollectRunResult {
  run_id: string
  status: string
  created_at: string
}

interface CollectRunRow {
  id: string
  trigger: string
  status: string
  error_code: string | null
  created_at: string
  finished_at: string | null
}

const RUN_SELECT = 'id, trigger, status, error_code, created_at, finished_at'

const loadFailed = () =>
  new ApiError(
    500,
    'COLLECT_RUN_LOAD_FAILED',
    '첫 수집 결과를 불러오지 못했습니다. 잠시 후 다시 시도해주세요.',
  )

const createFailed = () =>
  new ApiError(
    500,
    'COLLECT_RUN_CREATE_FAILED',
    '새 메일 확인을 시작하지 못했습니다. 잠시 후 다시 시도해주세요.',
  )

async function buildRunResponse(
  userId: string,
  run: CollectRunRow,
): Promise<LatestCollectRun> {
  const [cardRows, settingRows] = await Promise.all([
    supabaseAdmin
      .from('collect_run_cards')
      .select(
        'issuer, status, statements_found, rows_added, rows_duplicated, rows_review, error_code',
      )
      .eq('run_id', run.id),
    supabaseAdmin
      .from('card_collect_settings')
      .select('next_collect_on')
      .eq('user_id', userId)
      .eq('enabled', true),
  ])
  if (cardRows.error || settingRows.error) {
    throw loadFailed()
  }

  const issuerOrder = new Map(
    CARD_ISSUERS.map((itIssuer, index) => [itIssuer.id, index]),
  )
  const cards: CollectRunCardResult[] = cardRows.data
    .map((itRow) => ({
      issuer: itRow.issuer,
      name: findCardIssuer(itRow.issuer)?.name ?? itRow.issuer,
      status: itRow.status,
      statements_found: itRow.statements_found,
      rows_added: itRow.rows_added,
      rows_duplicated: itRow.rows_duplicated,
      rows_review: itRow.rows_review,
      error_code: itRow.error_code,
    }))
    .sort(
      (a, b) =>
        (issuerOrder.get(a.issuer) ?? Number.MAX_SAFE_INTEGER) -
        (issuerOrder.get(b.issuer) ?? Number.MAX_SAFE_INTEGER),
    )

  const nextDates = settingRows.data
    .map((itRow) => itRow.next_collect_on as string | null)
    .filter((itDate): itDate is string => itDate !== null)
    .sort()

  return {
    run_id: run.id,
    trigger: run.trigger,
    status: run.status,
    error_code: run.error_code,
    created_at: run.created_at,
    finished_at: run.finished_at,
    totals: cards.reduce(
      (acc, itCard) => ({
        statements_found: acc.statements_found + itCard.statements_found,
        rows_added: acc.rows_added + itCard.rows_added,
        rows_duplicated: acc.rows_duplicated + itCard.rows_duplicated,
        rows_review: acc.rows_review + itCard.rows_review,
      }),
      {
        statements_found: 0,
        rows_added: 0,
        rows_duplicated: 0,
        rows_review: 0,
      },
    ),
    cards,
    next_collect_on: nextDates[0] ?? null,
  }
}

export async function getLatestCollectRun(
  userId: string,
): Promise<LatestCollectRun> {
  const run = await supabaseAdmin
    .from('collect_runs')
    .select(RUN_SELECT)
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (run.error) {
    throw loadFailed()
  }
  if (!run.data) {
    throw new ApiError(
      404,
      'COLLECT_RUN_NOT_FOUND',
      '수집 이력이 없습니다. 자동 등록을 먼저 켜주세요.',
    )
  }

  return buildRunResponse(userId, run.data)
}

export async function getCollectRunById(
  userId: string,
  runId: string,
): Promise<LatestCollectRun> {
  const run = await supabaseAdmin
    .from('collect_runs')
    .select(RUN_SELECT)
    .eq('user_id', userId)
    .eq('id', runId)
    .maybeSingle()
  if (run.error) {
    throw loadFailed()
  }
  if (!run.data) {
    throw new ApiError(
      404,
      'COLLECT_RUN_NOT_FOUND',
      '수집 실행을 찾을 수 없습니다.',
    )
  }

  return buildRunResponse(userId, run.data)
}

export async function createManualCollectRun(
  userId: string,
): Promise<ManualCollectRunResult> {
  await assertConnectionUsable(userId)

  const [cards, activeRun, lastManualRun, todayManualRuns] = await Promise.all([
    supabaseAdmin
      .from('card_collect_settings')
      .select('issuer')
      .eq('user_id', userId)
      .eq('enabled', true),
    supabaseAdmin
      .from('collect_runs')
      .select('id')
      .eq('user_id', userId)
      .in('status', ['queued', 'running'])
      .limit(1)
      .maybeSingle(),
    supabaseAdmin
      .from('collect_runs')
      .select('created_at')
      .eq('user_id', userId)
      .eq('trigger', 'manual')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabaseAdmin
      .from('collect_runs')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', userId)
      .eq('trigger', 'manual')
      .gte('created_at', manualCollectDayStart()),
  ])
  if (
    cards.error ||
    activeRun.error ||
    lastManualRun.error ||
    todayManualRuns.error
  ) {
    throw createFailed()
  }
  if (cards.data.length === 0) {
    throw new ApiError(
      409,
      'CARD_SETTINGS_REQUIRED',
      '명세서를 가져올 카드사를 먼저 선택해주세요.',
    )
  }
  if (activeRun.data) {
    throw new ApiError(
      409,
      'COLLECT_RUN_IN_PROGRESS',
      '이미 메일을 확인하고 있어요. 잠시 후 결과를 확인해주세요.',
    )
  }
  if (isManualDailyLimitReached(todayManualRuns.count ?? 0)) {
    throw new ApiError(
      429,
      'COLLECT_RUN_DAILY_LIMIT',
      `새 메일 확인은 하루에 ${MANUAL_COLLECT_DAILY_LIMIT}번까지 할 수 있어요. 내일 다시 시도해주세요.`,
    )
  }
  if (isManualRunTooSoon(lastManualRun.data?.created_at ?? null)) {
    throw new ApiError(
      429,
      'COLLECT_RUN_TOO_SOON',
      '새 메일 확인은 1분에 한 번만 할 수 있어요. 잠시 후 다시 시도해주세요.',
    )
  }

  const run = await supabaseAdmin
    .from('collect_runs')
    .insert({ user_id: userId, trigger: 'manual' })
    .select('id, status, created_at')
    .single()
  if (run.error) {
    throw createFailed()
  }

  const runCards = await supabaseAdmin.from('collect_run_cards').insert(
    cards.data.map((itRow) => ({
      run_id: run.data.id,
      user_id: userId,
      issuer: itRow.issuer,
    })),
  )
  if (runCards.error) {
    await supabaseAdmin
      .from('collect_runs')
      .update({
        status: 'failed',
        error_code: 'COLLECT_RUN_CREATE_FAILED',
        finished_at: new Date().toISOString(),
      })
      .eq('id', run.data.id)
    throw createFailed()
  }

  kickCollectWorker()

  return {
    run_id: run.data.id,
    status: run.data.status,
    created_at: run.data.created_at,
  }
}
