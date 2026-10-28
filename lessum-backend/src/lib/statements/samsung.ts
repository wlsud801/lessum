import { readExport, type ExportResult } from './samsung-export.js'
import {
  record,
  type SamsungSectionCheck,
  type SamsungValidation,
  type StatementContext,
  type StatementResult,
  type TransactionRecord,
} from './statement.js'
import { parseDate } from './text.js'

const DISCOUNT_LABELS = ['청구할인', '해외수수료할인']

export interface SamsungReference {
  context: StatementContext
  transactions: {
    transaction_date: string
    merchant: string
    original_amount: number | null
    billed_amount_krw: number | null
  }[]
  validation: {
    sections: Record<string, { declared_count: number | null }>
    declared_summary_krw: Record<string, number | null>
    declared_grand_total_krw: number | null
  }
}

const lookupKey = (...parts: unknown[]) => JSON.stringify(parts)

function countBy<T>(items: T[], key: (item: T) => string): Map<string, number> {
  const counts = new Map<string, number>()
  for (const item of items) {
    counts.set(key(item), (counts.get(key(item)) ?? 0) + 1)
  }
  return counts
}

export function parseSamsungExport(
  exported: ExportResult,
  reference?: SamsungReference,
): StatementResult {
  const context: StatementContext = reference
    ? reference.context
    : { payment_date: null, statement_month: null }

  const rows: TransactionRecord[] = exported.purchases.map((source) => {
    const row = record(
      'samsung',
      source.source_row,
      source.raw_date,
      source.merchant,
      source.original_amount,
      source.billed_principal_krw,
      context,
      {
        section: source.section,
        billed_amount_krw: source.billed_amount_krw,
        fee_krw: source.fee_krw,
        installment_months: source.installment_months || null,
        installment_round: source.installment_round || null,
        benefits: source.benefits,
      },
    )

    const discount = source.benefits
      .filter((benefit) => DISCOUNT_LABELS.includes(benefit.label))
      .reduce((sum, benefit) => sum + (benefit.amount_krw ?? 0), 0)
    row.billed_components_match =
      source.section === 'D1' ||
      (row.original_amount as number) + discount === row.billed_amount_krw
    if (!row.billed_components_match) {
      row.review_reasons.push('billed_amount_components_require_review')
      row.requires_review = true
    }
    return row
  })

  const purchaseQueues = new Map<string, string[]>()
  for (const row of rows) {
    const key = lookupKey(row.transaction_date, row.merchant, row.original_amount)
    purchaseQueues.set(key, [...(purchaseQueues.get(key) ?? []), row.source_row])
  }

  let linked = 0
  let foreignCount = 0
  const references: Record<string, unknown>[] = exported.references.map((source) => {
    const item: Record<string, unknown> = { ...source }
    item.transaction_date = parseDate(source.raw_date, context).date

    if (item.kind === 'foreign_detail_reference') {
      foreignCount += 1
      const key = lookupKey(item.transaction_date, item.merchant, item.amount_krw)
      const match = purchaseQueues.get(key)?.shift() ?? null
      item.linked_purchase_row = match
      if (match !== null) {
        linked += 1
      }
    }
    return item
  })

  const sections: Record<string, SamsungSectionCheck> = exported.sections
  const warnings: string[] = []
  let excerptMatches = false
  let countsMatch = false
  let statementTotalMatches = false

  if (reference) {
    const expected = reference.validation
    countsMatch = ['D0', 'D1', 'DE'].every(
      (code) => sections[code].row_count === expected.sections[code].declared_count,
    )

    const rowKey = (r: { transaction_date: string; merchant: string; original_amount: number | null; billed_amount_krw?: number | null }) =>
      lookupKey(r.transaction_date, r.merchant, r.original_amount, r.billed_amount_krw)
    const fullCounts = countBy(rows, rowKey)
    excerptMatches = [...countBy(reference.transactions, rowKey)].every(
      ([key, needed]) => (fullCounts.get(key) ?? 0) >= needed,
    )

    const adjustments = Object.entries(expected.declared_summary_krw)
      .filter(([label, value]) => !['일시불', '할부'].includes(label) && value !== null)
      .reduce((sum, [, value]) => sum + (value as number), 0)
    statementTotalMatches =
      exported.card_summary_total_krw + adjustments === expected.declared_grand_total_krw

    for (const [code, section] of Object.entries(sections)) {
      section.expected_count_from_html = expected.sections[code].declared_count
      section.count_matches = section.row_count === section.expected_count_from_html
    }
  } else {
    warnings.push(
      'Export has no payment date; supply the matching rendered HTML as context for period and count validation.',
    )
  }

  const foreignComponentsMatch = references.every(
    (item) => (item.components_match ?? true) === true,
  )
  const complete =
    Object.values(sections).every((section) => section.amount_matches) &&
    exported.card_summary_matches &&
    rows.every((row) => row.billed_components_match) &&
    linked === foreignCount &&
    foreignComponentsMatch &&
    countsMatch &&
    excerptMatches &&
    statementTotalMatches
  warnings.push(
    'Foreign details are references; cancellations need linkage and are not deducted again automatically.',
  )

  const validation: SamsungValidation = {
    complete,
    row_count: rows.length,
    review_row_count: rows.filter((row) => row.requires_review).length,
    sections,
    card_summary_total_krw: exported.card_summary_total_krw,
    card_summary_matches: exported.card_summary_matches,
    source_counts_match: countsMatch,
    comparison_excerpt_matches: excerptMatches,
    statement_total_matches: statementTotalMatches,
    foreign_reference_count: foreignCount,
    linked_foreign_references: linked,
    foreign_components_match: foreignComponentsMatch,
    cancellation_reference_count: references.length - foreignCount,
  }

  return {
    status: complete ? 'parsed' : 'needs_review',
    context,
    transactions: rows,
    references,
    warnings,
    validation,
  }
}

export async function parseSamsungXlsx(
  data: Uint8Array,
  reference?: SamsungReference,
): Promise<StatementResult> {
  return parseSamsungExport(await readExport(data), reference)
}
