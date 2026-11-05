import { ApiError } from '../lib/errors.js'
import type { ManualTransactionInput } from '../lib/manual-transaction.js'
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

const TRANSACTION_COLUMNS =
  'id, transaction_date, transaction_type, merchant_name, amount, memo, source_type'

interface TransactionRow {
  id: string
  transaction_date: string | null
  transaction_type: string
  merchant_name: string | null
  amount: number | null
  memo: string | null
  source_type: string
}

function toManualItem(
  row: TransactionRow,
  paymentMethod: string | null,
): TransactionItem {
  return {
    id: row.id,
    transaction_date: row.transaction_date,
    transaction_type: row.transaction_type,
    merchant_name: row.merchant_name,
    amount: row.amount,
    payment_method: paymentMethod,
    source_type: row.source_type,
    memo: row.memo,
    requires_review: false,
    review_reasons: [],
  }
}

export async function createManualTransaction(
  userId: string,
  input: ManualTransactionInput,
): Promise<TransactionItem> {
  let methodNickname: string | null = null
  if (input.paymentMethodId) {
    const method = await supabaseAdmin
      .from('payment_methods')
      .select('id, nickname')
      .eq('id', input.paymentMethodId)
      .eq('user_id', userId)
      .is('archived_at', null)
      .maybeSingle()
    if (method.error) {
      throw new ApiError(
        500,
        'TRANSACTION_SAVE_FAILED',
        '거래를 저장하지 못했습니다.',
      )
    }
    if (!method.data) {
      throw new ApiError(
        400,
        'PAYMENT_METHOD_NOT_FOUND',
        '결제 수단을 찾을 수 없습니다.',
      )
    }
    methodNickname = method.data.nickname
  }

  const inserted = await supabaseAdmin
    .from('transactions')
    .insert({
      user_id: userId,
      transaction_date: input.transactionDate,
      transaction_type: input.transactionType,
      merchant_name: input.merchantName,
      amount: input.amount,
      payment_method_id: input.paymentMethodId,
      source_type: 'MANUAL',
      memo: input.memo,
      client_request_id: input.clientRequestId,
    })
    .select(TRANSACTION_COLUMNS)
    .single()

  if (inserted.error) {
    if (inserted.error.code === '23505' && input.clientRequestId) {
      const existing = await supabaseAdmin
        .from('transactions')
        .select(TRANSACTION_COLUMNS)
        .eq('user_id', userId)
        .eq('client_request_id', input.clientRequestId)
        .single()
      if (!existing.error) {
        return toManualItem(existing.data, methodNickname)
      }
    }
    throw new ApiError(
      500,
      'TRANSACTION_SAVE_FAILED',
      '거래를 저장하지 못했습니다.',
    )
  }

  return toManualItem(inserted.data, methodNickname)
}
