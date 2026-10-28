import { StatementFormatError } from './errors.js'
import { visibleText } from './html.js'
import { clean, parseDate, type DateBasis, type DateContext } from './text.js'
import { isValidDateString } from '../collect-schedule.js'

export interface StatementContext {
  payment_date: string | null
  statement_month: string | null
}

export type TransactionKind =
  | 'purchase_candidate'
  | 'refund'
  | 'adjustment_reference'

export interface TransactionRecord {
  issuer: string
  source_row: string
  transaction_date: string
  raw_date: string
  date_basis: DateBasis
  merchant: string
  original_amount: number | null
  currency: string | null
  amount_krw: number | null
  billed_principal_krw: number | null
  fee_krw: number | null
  installment_months: number | null
  installment_round: number | null
  kind: TransactionKind
  review_reasons: string[]
  requires_review: boolean
  posting_status: 'candidate'
  benefit_text?: string
  card_label?: string
  payable_krw?: number | null
  section?: string
  billed_amount_krw?: number | null
  benefits?: { label: string; amount_krw: number | null }[]
  billed_components_match?: boolean
  source_row_id?: string
}

export type RecordExtras = Partial<
  Pick<
    TransactionRecord,
    | 'fee_krw'
    | 'installment_months'
    | 'installment_round'
    | 'benefit_text'
    | 'card_label'
    | 'payable_krw'
    | 'section'
    | 'billed_amount_krw'
    | 'benefits'
  >
>

export interface FinishValidation {
  row_count: number
  review_row_count: number
  parsed_billed_principal_krw: number
  declared_billed_principal_krw: number | null
  parsed_fees_krw: number
  declared_fees_krw: number | null
  fees_match: boolean
  principal_matches: boolean
  unparsed_dated_rows: number
  purchase_row_count?: number
  declared_purchase_count?: number | null
  purchase_count_matches?: boolean
}

export interface SamsungSectionCheck {
  row_count: number
  benefit_continuation_rows?: number
  billed_principal_krw?: number
  fee_krw?: number
  declared_principal_krw?: number | null
  declared_fees_krw?: number | null
  billed_amount_krw?: number
  declared_billed_amount_krw?: number | null
  amount_matches: boolean
  expected_count_from_html?: number | null
  count_matches?: boolean
}

export interface SamsungValidation {
  complete: boolean
  row_count: number
  review_row_count: number
  sections: Record<string, SamsungSectionCheck>
  card_summary_total_krw: number
  card_summary_matches: boolean
  source_counts_match: boolean
  comparison_excerpt_matches: boolean
  statement_total_matches: boolean
  foreign_reference_count: number
  linked_foreign_references: number
  foreign_components_match: boolean
  cancellation_reference_count: number
  cancellation_count_matches?: boolean
}

export type StatementStatus =
  | 'parsed'
  | 'needs_review'
  | 'password_required'
  | 'requires_online_statement'

export interface StatementResult {
  status: StatementStatus
  context?: StatementContext
  transactions: TransactionRecord[]
  references: Record<string, unknown>[]
  warnings: string[]
  validation?: FinishValidation | SamsungValidation
  issuer?: string
  parser_version?: string
  source_format?: string
  source_sha256?: string
  attachment_sha256?: string
}

const PAYMENT_DATE_PATTERN =
  /(?:결제일|출금일)\s*[:：]?\s*(20\d{2})년\s*(\d{1,2})월\s*(\d{1,2})일/

export type CardStatementResult = StatementResult & {
  validation: FinishValidation
}

export function statementContext(text: string): StatementContext {
  const match = PAYMENT_DATE_PATTERN.exec(visibleText(text))
  if (!match) {
    throw new StatementFormatError('Statement payment date unavailable')
  }

  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])]
  const iso = [
    String(year),
    String(month).padStart(2, '0'),
    String(day).padStart(2, '0'),
  ].join('-')
  if (!isValidDateString(iso)) {
    throw new StatementFormatError('Statement payment date unavailable')
  }
  return { payment_date: iso, statement_month: iso.slice(0, 7) }
}

export function record(
  issuer: string,
  rowKey: string,
  rawDate: string,
  merchant: string,
  rawAmount: number | null,
  billed: number | null,
  context: DateContext,
  extra: RecordExtras = {},
): TransactionRecord {
  const { date, basis } = parseDate(rawDate, context)
  const flags: string[] = []
  if (basis !== 'explicit') {
    flags.push('transaction_year_inferred')
  }
  if (rawAmount === null) {
    flags.push('original_amount_missing')
  }

  const row: TransactionRecord = {
    issuer,
    source_row: rowKey,
    transaction_date: date,
    raw_date: rawDate,
    date_basis: basis,
    merchant: clean(merchant),
    original_amount: rawAmount,
    currency: 'KRW',
    amount_krw: rawAmount,
    billed_principal_krw: billed,
    fee_krw: null,
    installment_months: null,
    installment_round: null,
    kind: rawAmount !== null && rawAmount < 0 ? 'refund' : 'purchase_candidate',
    review_reasons: flags,
    requires_review: false,
    posting_status: 'candidate',
    ...extra,
  }

  if (row.installment_months) {
    flags.push('installment_purchase_reconciliation_required')
  }
  row.requires_review = flags.length > 0
  return row
}

export function finish(
  context: StatementContext,
  rows: TransactionRecord[],
  declared: number | null,
  fees: number,
  skipped: number,
  declaredFee: number | null = null,
): CardStatementResult {
  if (rows.length === 0) {
    throw new StatementFormatError(
      'No verified transaction rows; unsupported or empty statement',
    )
  }

  const principal = rows.reduce(
    (sum, row) => sum + (row.billed_principal_krw ?? 0),
    0,
  )
  const principalMatches = declared !== null && principal === declared
  const feesMatch = declaredFee !== null && fees === declaredFee
  const verified = principalMatches && feesMatch && skipped === 0

  return {
    status: verified ? 'parsed' : 'needs_review',
    context,
    transactions: rows,
    references: [],
    warnings: [],
    validation: {
      row_count: rows.length,
      review_row_count: rows.filter((row) => row.requires_review).length,
      parsed_billed_principal_krw: principal,
      declared_billed_principal_krw: declared,
      parsed_fees_krw: fees,
      declared_fees_krw: declaredFee,
      fees_match: feesMatch,
      principal_matches: principalMatches,
      unparsed_dated_rows: skipped,
    },
  }
}
