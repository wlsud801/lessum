export type TransactionType =
  | 'INCOME'
  | 'CARD_EXPENSE'
  | 'ACCOUNT_EXPENSE'
  | 'CASH_EXPENSE'
  | 'EXPENSE_REFUND'
  | 'INCOME_RETURN'
  | 'CARD_BILL_PAYMENT'
  | 'INTERNAL_TRANSFER'

export type TransactionSourceType = 'EMAIL' | 'STATEMENT_FILE' | 'CSV' | 'MANUAL'

export interface TransactionItem {
  id: string
  transaction_date: string | null
  transaction_type: TransactionType
  merchant_name: string | null
  amount: number | null
  payment_method: string | null
  source_type: TransactionSourceType
  memo: string | null
  requires_review: boolean
  review_reasons: string[]
}

export interface TransactionsResponse {
  month: string
  review_count: number
  transactions: TransactionItem[]
}

export interface PaymentMethodItem {
  id: string
  method_type: 'CARD' | 'ACCOUNT' | 'CASH'
  nickname: string
}

export interface CreateTransactionPayload {
  transaction_type: TransactionType
  transaction_date: string
  merchant_name: string
  amount: number
  payment_method_id: string | null
  memo: string | null
  client_request_id: string
}

export interface AddTransactionState {
  error?: string
  success?: boolean
}
