import { StatementFormatError } from './errors.js'
import { cells, findTable, loadDocument, tableRows } from './html.js'
import {
  finish,
  record,
  statementContext,
  type StatementResult,
  type TransactionRecord,
} from './statement.js'
import { amount } from './text.js'

export function parseWoori(text: string): StatementResult {
  const context = statementContext(text)
  const $ = loadDocument(text)
  const table = findTable($, '이용일자', '이용가맹점', '납부하실금액')

  const rows: TransactionRecord[] = []
  let declared: number | null = null
  let declaredFee: number | null = null
  let fees = 0
  let skipped = 0
  let cardLabel = ''

  tableRows($, table).forEach((tr, index) => {
    const c = cells($, tr)

    if (c.length === 1 && c[0].startsWith('(')) {
      cardLabel = c[0]
    }

    if (c.length > 0 && /^\d{2}\/\d{2}$/.test(c[0])) {
      if (c.length !== 13) {
        throw new StatementFormatError('Woori transaction columns changed')
      }

      const fee = amount(c[6])
      const original = amount(c[2])
      const billed = amount(c[5])
      const row = record(
        'woori',
        `transactions:${index}`,
        c[0],
        c[1],
        original,
        billed,
        context,
        {
          fee_krw: fee,
          payable_krw: amount(c[9]),
          card_label: cardLabel,
          installment_months: amount(c[3]),
          installment_round: amount(c[4]),
        },
      )

      if (cardLabel.includes('체크') && billed === 0) {
        row.currency = null
        row.amount_krw = null
        row.review_reasons.push(
          'check_debit_currency_and_transaction_type_require_review',
        )
        row.requires_review = true
      }
      rows.push(row)
      fees += fee ?? 0
    } else if (c.length > 0 && c[0] === '통합청구합계') {
      declared = amount(c[4])
      declaredFee = amount(c[5]) ?? 0
    } else if (c.length > 0 && /^\d{1,2}[/.-]\d/.test(c[0])) {
      skipped += 1
    }
  })

  return finish(context, rows, declared, fees, skipped, declaredFee)
}
