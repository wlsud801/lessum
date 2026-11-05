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
