import { StatementFormatError } from './errors.js'
import {
  cells,
  findTable,
  loadDocument,
  tableRows,
  textContent,
} from './html.js'
import {
  finish,
  record,
  statementContext,
  type CardStatementResult,
  type TransactionRecord,
} from './statement.js'
import { amount, clean } from './text.js'

export function parseLotte(text: string): CardStatementResult {
  const context = statementContext(text)
  const $ = loadDocument(text)
  const table = findTable($, '이용내역', '이용총액', '할부회차')

  const rows: TransactionRecord[] = []
  let declared: number | null = null
  let declaredFee: number | null = null
  let fees = 0
  let skipped = 0

  tableRows($, table).forEach((tr, index) => {
    const c = cells($, tr)
    const firstCell = $(tr).children('td').first()
    const day = firstCell
      .find('em')
      .toArray()
      .filter((em) => (em.attribs.class ?? '').includes('useday'))

    if (day.length > 0) {
      if (c.length !== 8) {
        throw new StatementFormatError('Lotte transaction columns changed')
      }
      const rawDate = clean(textContent(day[0]))
      const merchant = c[0].slice(rawDate.length).trim()
      const terms = c[2] ? /^(\d+)\s*\/\s*(\d+)$/.exec(c[2]) : null
      if (c[2] && !terms) {
        throw new StatementFormatError('Unknown installment notation')
      }

      const fee = amount(c[4])
      rows.push(
        record(
          'lotte',
          `transactions:${index}`,
          rawDate,
          merchant,
          amount(c[1]),
          amount(c[3]),
          context,
          {
            fee_krw: fee,
            installment_round: terms ? Number(terms[1]) : null,
            installment_months: terms ? Number(terms[2]) : null,
            benefit_text: c[6],
          },
        ),
      )
      fees += fee ?? 0
    } else if (c.length > 0 && c[0] === '카드이용합계') {
      declared = amount(c[3])
      declaredFee = amount(c[4]) ?? 0
    } else if ((firstCell.attr('headers') ?? '').includes('card_field1')) {
      skipped += 1
    }
  })

  return finish(context, rows, declared, fees, skipped, declaredFee)
}
