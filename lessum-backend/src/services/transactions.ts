import { ApiError } from '../lib/errors.js'
import { supabaseAdmin } from '../lib/supabase.js'

const MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/

export interface TransactionItem {
  id: string
  transaction_date: string | null
  transaction_type: string
  merchant_name: string | null
  amount: number | null
  payment_method: string | null
  source_type: string
  memo: string | null
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
    .from('transactions')
    .select(
      'id, transaction_date, transaction_type, merchant_name, amount, memo, source_type, payment_method:payment_methods!transactions_payment_method_id_fkey(nickname), reviews:transaction_reviews(reason, resolved_at)',
    )
    .eq('user_id', userId)
    .is('deleted_at', null)
    .is('voided_at', null)
    .is('reviews.resolved_at', null)
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
    const method = Array.isArray(itRow.payment_method)
      ? itRow.payment_method[0]
      : itRow.payment_method
    const reviews = itRow.reviews ?? []
    return {
      id: itRow.id,
      transaction_date: itRow.transaction_date,
      transaction_type: itRow.transaction_type,
      merchant_name: itRow.merchant_name,
      amount: itRow.amount,
      payment_method: method?.nickname ?? null,
      source_type: itRow.source_type,
      memo: itRow.memo,
      requires_review: reviews.length > 0,
      review_reasons: reviews.map((itReview) => itReview.reason),
    }
  })

  return {
    month,
    review_count: transactions.filter((itRow) => itRow.requires_review).length,
    transactions,
  }
}
