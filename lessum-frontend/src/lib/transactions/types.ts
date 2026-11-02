export type CardIssuer = 'hyundai' | 'lotte' | 'woori' | 'samsung'

export interface TransactionItem {
  id: string
  kind: 'purchase_candidate' | 'refund' | 'adjustment_reference'
  transaction_date: string | null
  raw_date: string | null
  merchant: string | null
  issuer: CardIssuer
  amount_krw: number | null
  requires_review: boolean
  review_reasons: string[]
}

export interface TransactionsResponse {
  month: string
  review_count: number
  transactions: TransactionItem[]
}
