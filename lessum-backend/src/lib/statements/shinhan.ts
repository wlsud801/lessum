import { isValidDateString } from '../collect-schedule.js'
import { StatementFormatError } from './errors.js'
import {
  cells,
  findTable,
  loadDocument,
  tableRows,
  visibleText,
} from './html.js'
import {
  finish,
  record,
  type CardStatementResult,
  type StatementContext,
  type TransactionRecord,
} from './statement.js'
import { amount } from './text.js'

const PAYMENT_DATE_PATTERN = /결제일\s*[:：]?\s*(20\d{2})\.(\d{1,2})\.(\d{1,2})/

function shinhanContext(text: string): StatementContext {
  const match = PAYMENT_DATE_PATTERN.exec(visibleText(text))
  if (!match) {
    throw new StatementFormatError('Statement payment date unavailable')
  }

  const iso = [
    match[1],
    match[2].padStart(2, '0'),
    match[3].padStart(2, '0'),
  ].join('-')
  if (!isValidDateString(iso)) {
    throw new StatementFormatError('Statement payment date unavailable')
  }
  return { payment_date: iso, statement_month: iso.slice(0, 7) }
}

export function parseShinhan(text: string): CardStatementResult {
  const context = shinhanContext(text)
  const $ = loadDocument(text)
  const table = findTable($, '이용가맹점', '이번달 내실금액', '포인트')

  const rows: TransactionRecord[] = []
  const pending: TransactionRecord[] = []
  let declared: number | null = null
  let declaredFee: number | null = null
  let declaredCount: number | null = null
  let fees = 0
  let skipped = 0

  tableRows($, table).forEach((tr, index) => {
    const c = cells($, tr)
    if (c.length === 0) {
      return
    }

    if (/^\d{2}\.\d{2}\.\d{2}$/.test(c[0])) {
      if (c.length !== 11) {
        throw new StatementFormatError('Shinhan transaction columns changed')
      }

      const terms = c[4] ? /^(\d+)\s*\/\s*(\d+)$/.exec(c[4]) : null
      if (c[4] && !terms) {
        throw new StatementFormatError('Unknown installment notation')
      }

      const original = amount(c[3])
      const billed = amount(c[5])
      const fee = amount(c[6])
      const row = record(
        'shinhan',
        `transactions:${index}`,
        c[0],
        c[2],
        original ?? billed,
        billed,
        context,
        {
          fee_krw: fee,
          card_label: c[1],
          installment_months: terms ? Number(terms[1]) : null,
          installment_round: terms ? Number(terms[2]) : null,
          ...(c[7] ? { benefits: [{ label: c[7], amount_krw: amount(c[8]) }] } : {}),
        },
      )
      rows.push(row)
      pending.push(row)
      fees += fee ?? 0
    } else if (c.length === 7 && c[0] === '총합계') {
      declared = amount(c[2])
      declaredFee = amount(c[3]) ?? 0
      const count = /^(\d+)\s*건$/.exec(c[1])
      declaredCount = count ? Number(count[1]) : null
    } else if (c.length === 7 && /(소계|합계)$/.test(c[0])) {
      const foreign = c[0].includes('해외')
      for (const itRow of pending) {
        itRow.section = c[0]
        if (foreign) {
          itRow.currency = null
          itRow.amount_krw =
            itRow.billed_principal_krw === null && itRow.fee_krw === null
              ? null
              : (itRow.billed_principal_krw ?? 0) + (itRow.fee_krw ?? 0)
          itRow.review_reasons.push('foreign_currency_requires_review')
          itRow.requires_review = true
        }
      }
      pending.length = 0
    } else if (/^\d{1,2}[./-]\d/.test(c[0])) {
      skipped += 1
    }
  })

  const result = finish(context, rows, declared, fees, skipped, declaredFee)
  result.validation.purchase_row_count = rows.length
  result.validation.declared_purchase_count = declaredCount
  result.validation.purchase_count_matches = rows.length === declaredCount
  if (declaredCount !== rows.length) {
    result.status = 'needs_review'
  }
  result.warnings.push(
    'Foreign transactions are billed amounts (KRW); original currency details are excluded.',
  )
  return result
}
