import { ApiError } from '../lib/errors.js'
import { supabaseAdmin } from '../lib/supabase.js'

const MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/

export interface TransactionItem {
  id: string
  kind: string
  transaction_date: string | null
  raw_date: string | null
  merchant: string | null
  issuer: string
  amount_krw: number | null
  requires_review: boolean
  review_reasons: string[]
}

export interface MonthlyTransactions {
  month: string
  review_count: number
  transactions: TransactionItem[]
}

export function assertValidMonth(month: unknown): asserts month is string {
  if (typeof month !== 'string' || !MONTH_PATTERN.test(month)) {
    throw new ApiError(
      400,
      'INVALID_MONTH',
      '조회할 월을 YYYY-MM 형식으로 전달해주세요.',
    )
  }
}

function monthRange(month: string) {
  const [year, monthNumber] = month.split('-').map(Number)
  const next = new Date(Date.UTC(year, monthNumber, 1))
  const nextMonth = `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, '0')}`
  return { from: `${month}-01`, to: `${nextMonth}-01` }
}

export async function getMonthlyTransactions(
  userId: string,
  month: string,
): Promise<MonthlyTransactions> {
  const { from, to } = monthRange(month)

  const rows = await supabaseAdmin
    .from('statement_rows')
    .select(
      'id, kind, transaction_date, raw_date, merchant, amount_krw, requires_review, review_reasons, statements!inner(issuer)',
    )
    .eq('user_id', userId)
    .or(
      `and(transaction_date.gte.${from},transaction_date.lt.${to}),transaction_date.is.null`,
    )
    .order('transaction_date', { ascending: false, nullsFirst: true })
    .order('created_at', { ascending: false })

  if (rows.error) {
    throw new ApiError(
      500,
      'TRANSACTIONS_LOAD_FAILED',
      '거래 내역을 불러오지 못했습니다.',
    )
  }

  const transactions: TransactionItem[] = rows.data.map((itRow) => {
    const statement = Array.isArray(itRow.statements)
      ? itRow.statements[0]
      : itRow.statements
    return {
      id: itRow.id,
      kind: itRow.kind,
      transaction_date: itRow.transaction_date,
      raw_date: itRow.raw_date,
      merchant: itRow.merchant,
      issuer: statement?.issuer ?? '',
      amount_krw: itRow.amount_krw,
      requires_review: itRow.requires_review,
      review_reasons: itRow.review_reasons ?? [],
    }
  })

  return {
    month,
    review_count: transactions.filter((itRow) => itRow.requires_review).length,
    transactions,
  }
}
