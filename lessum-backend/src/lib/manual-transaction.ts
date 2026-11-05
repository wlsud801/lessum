import { isValidDateString } from './collect-schedule.js'
import { ApiError } from './errors.js'

export const MANUAL_TRANSACTION_TYPES = [
  'INCOME',
  'CARD_EXPENSE',
  'ACCOUNT_EXPENSE',
  'CASH_EXPENSE',
  'EXPENSE_REFUND',
  'INCOME_RETURN',
  'CARD_BILL_PAYMENT',
  'INTERNAL_TRANSFER',
] as const

export type ManualTransactionType = (typeof MANUAL_TRANSACTION_TYPES)[number]

export interface ManualTransactionInput {
  transactionType: ManualTransactionType
  transactionDate: string
  merchantName: string
  amount: number
  paymentMethodId: string | null
  memo: string | null
  clientRequestId: string | null
}

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const MAX_MERCHANT_LENGTH = 100
const MAX_MEMO_LENGTH = 500

const invalid = (message: string) =>
  new ApiError(400, 'INVALID_TRANSACTION_INPUT', message)

function parseOptionalUuid(value: unknown, label: string): string | null {
  if (value === undefined || value === null || value === '') {
    return null
  }
  if (typeof value !== 'string' || !UUID_PATTERN.test(value)) {
    throw invalid(`${label} 형식이 올바르지 않습니다.`)
  }
  return value
}

export function parseManualTransactionInput(
  body: unknown,
): ManualTransactionInput {
  if (typeof body !== 'object' || body === null) {
    throw invalid('요청 본문이 비어 있습니다.')
  }
  const record = body as Record<string, unknown>

  const transactionType = record.transaction_type
  if (
    typeof transactionType !== 'string' ||
    !MANUAL_TRANSACTION_TYPES.includes(
      transactionType as ManualTransactionType,
    )
  ) {
    throw invalid('거래 유형을 선택해주세요.')
  }

  const transactionDate = record.transaction_date
  if (
    typeof transactionDate !== 'string' ||
    !isValidDateString(transactionDate)
  ) {
    throw invalid('거래일을 YYYY-MM-DD 형식으로 입력해주세요.')
  }

  const merchantName =
    typeof record.merchant_name === 'string' ? record.merchant_name.trim() : ''
  if (merchantName.length === 0) {
    throw invalid('거래처를 입력해주세요.')
  }
  if (merchantName.length > MAX_MERCHANT_LENGTH) {
    throw invalid(`거래처는 ${MAX_MERCHANT_LENGTH}자 이하로 입력해주세요.`)
  }

  const amount = record.amount
  if (
    typeof amount !== 'number' ||
    !Number.isSafeInteger(amount) ||
    amount <= 0
  ) {
    throw invalid('금액은 1원 이상의 정수로 입력해주세요.')
  }

  const memoValue =
    typeof record.memo === 'string' ? record.memo.trim() : ''
  if (memoValue.length > MAX_MEMO_LENGTH) {
    throw invalid(`메모는 ${MAX_MEMO_LENGTH}자 이하로 입력해주세요.`)
  }

  return {
    transactionType: transactionType as ManualTransactionType,
    transactionDate,
    merchantName,
    amount,
    paymentMethodId: parseOptionalUuid(record.payment_method_id, '결제 수단'),
    memo: memoValue.length > 0 ? memoValue : null,
    clientRequestId: parseOptionalUuid(record.client_request_id, '요청 ID'),
  }
}
