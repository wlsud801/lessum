import { CARD_ISSUERS, findCardIssuer } from '../lib/card-issuers.js'
import { ApiError } from '../lib/errors.js'
import { supabaseAdmin } from '../lib/supabase.js'

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

const loadFailed = () =>
  new ApiError(
    500,
    'COLLECT_RUN_LOAD_FAILED',
    '첫 수집 결과를 불러오지 못했습니다. 잠시 후 다시 시도해주세요.',
  )

export async function getLatestCollectRun(
  userId: string,
): Promise<LatestCollectRun> {
  const run = await supabaseAdmin
    .from('collect_runs')
    .select('id, trigger, status, error_code, created_at, finished_at')
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

  const [cardRows, settingRows] = await Promise.all([
    supabaseAdmin
      .from('collect_run_cards')
      .select(
        'issuer, status, statements_found, rows_added, rows_duplicated, rows_review, error_code',
      )
      .eq('run_id', run.data.id),
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
    run_id: run.data.id,
    trigger: run.data.trigger,
    status: run.data.status,
    error_code: run.data.error_code,
    created_at: run.data.created_at,
    finished_at: run.data.finished_at,
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
