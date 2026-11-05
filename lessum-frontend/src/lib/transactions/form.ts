import type {
  TransactionItem,
  TransactionType,
  UpdateTransactionPayload,
} from './types'

export interface TransactionFormValues {
  type: TransactionType
  date: string
  merchant: string
  amount: string
  methodId: string
  memo: string
}

export function todayDateString() {
  return new Date().toLocaleDateString('en-CA')
}

export function emptyTransactionValues(): TransactionFormValues {
  return {
    type: 'ACCOUNT_EXPENSE',
    date: todayDateString(),
    merchant: '',
    amount: '',
    methodId: '',
    memo: '',
  }
}

export function toTransactionValues(
  transaction: TransactionItem,
): TransactionFormValues {
  return {
    type: transaction.transaction_type,
    date: transaction.transaction_date ?? todayDateString(),
    merchant: transaction.merchant_name ?? '',
    amount: transaction.amount !== null ? String(transaction.amount) : '',
    methodId: transaction.payment_method_id ?? '',
    memo: transaction.memo ?? '',
  }
}

export type TransactionPayloadResult =
  | { ok: false; error: string }
  | { ok: true; payload: UpdateTransactionPayload }

export function buildTransactionPayload(
  values: TransactionFormValues,
): TransactionPayloadResult {
  const merchant = values.merchant.trim()
  if (!merchant) {
    return { ok: false, error: '거래처를 입력해주세요.' }
  }

  const amount = Number(values.amount.replaceAll(',', '').trim())
  if (!Number.isSafeInteger(amount) || amount <= 0) {
    return { ok: false, error: '금액은 1원 이상의 정수로 입력해주세요.' }
  }

  return {
    ok: true,
    payload: {
      transaction_type: values.type,
      transaction_date: values.date,
      merchant_name: merchant,
      amount,
      payment_method_id: values.methodId || null,
      memo: values.memo.trim() || null,
    },
  }
}
