import type { TransactionSourceType, TransactionType } from './types'

export const TYPE_LABELS: Record<TransactionType, string> = {
  INCOME: '수입',
  CARD_EXPENSE: '카드 지출',
  ACCOUNT_EXPENSE: '계좌 지출',
  CASH_EXPENSE: '현금 지출',
  EXPENSE_REFUND: '환불',
  INCOME_RETURN: '수입 반환',
  CARD_BILL_PAYMENT: '카드대금 납부',
  INTERNAL_TRANSFER: '내 계좌 이동',
}

export const SOURCE_LABELS: Record<TransactionSourceType, string> = {
  EMAIL: '메일',
  STATEMENT_FILE: '파일',
  CSV: 'CSV',
  MANUAL: '수기',
}
