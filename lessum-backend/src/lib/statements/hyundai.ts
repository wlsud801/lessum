import { StatementFormatError } from './errors.js'
import {
  cells,
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

const CONSTRUCTOR_ARGUMENT_COUNT = 16
const FULLWIDTH_EXCEPTIONS: Record<number, string> = {
  8217: "'",
  8221: '"',
  12288: ' ',
  65507: '~',
  65509: '\\',
}
const SIMPLE_ESCAPES: Record<string, string> = {
  n: '\n',
  r: '\r',
  t: '\t',
  '\\': '\\',
  "'": "'",
  '"': '"',
  '/': '/',
}

export function jsArguments(source: string): string[] {
  const values: string[] = []
  let start = 0
  let depth = 0
  let quote: string | null = null
  let escaped = false

  for (let i = 0; i < source.length; i++) {
    const char = source[i]
    if (quote) {
      if (escaped) {
        escaped = false
      } else if (char === '\\') {
        escaped = true
      } else if (char === quote) {
        quote = null
      }
    } else if (char === '"' || char === "'") {
      quote = char
    } else if (char === '(') {
      depth += 1
    } else if (char === ')') {
      depth -= 1
    } else if (char === ',' && depth === 0) {
      values.push(source.slice(start, i).trim())
      start = i + 1
    }
  }

  if (depth !== 0 || quote) {
    throw new StatementFormatError('Unbalanced constructor literal')
  }
  values.push(source.slice(start).trim())
  return values
}

export function jsString(value: string): string {
  const first = value[0]
  if (value.length < 2 || (first !== '"' && first !== "'") || value.at(-1) !== first) {
    throw new StatementFormatError('Expected JavaScript string literal')
  }

  return value
    .slice(1, -1)
    .replace(
      /\\(?:u([0-9a-fA-F]{4})|x([0-9a-fA-F]{2})|([\s\S]))/g,
      (_match, unicode?: string, hex?: string, other?: string) => {
        const code = unicode ?? hex
        if (code !== undefined) {
          return String.fromCharCode(parseInt(code, 16))
        }
        return SIMPLE_ESCAPES[other!] ?? other!
      },
    )
}

export function literalValue(value: string): string {
  const wrapper = /^gf_Convert2ByteChar2\(([\s\S]*)\)$/.exec(value)
  let text = jsString(wrapper ? wrapper[1] : value)

  if (wrapper) {
    text = [...text]
      .map((char) => {
        const code = char.charCodeAt(0)
        if (char.length === 1 && code >= 65281 && code <= 65374 && code !== 65340) {
          return String.fromCharCode(code - 65248)
        }
        return char.length === 1 ? (FULLWIDTH_EXCEPTIONS[code] ?? char) : char
      })
      .join('')
  }
  return clean(text)
}

export function hyundaiData(text: string): string[][] {
  const values: string[][] = []
  const constructorPattern =
    /arUseDesc\[loop\+\+\]\s*=\s*new UseDesc\(([\s\S]*?)\);/g

  for (const match of text.matchAll(constructorPattern)) {
    const args = jsArguments(match[1])
    if (args.length !== CONSTRUCTOR_ARGUMENT_COUNT || args[0] !== 'loop') {
      throw new StatementFormatError('Hyundai constructor schema changed')
    }
    values.push(['loop', ...args.slice(1).map(literalValue)])
  }
  if (values.length === 0) {
    throw new StatementFormatError('Hyundai literal transaction data missing')
  }

  const count = /arUseDesc\s*=\s*Array\((\d+)\)/.exec(text)
  if (!count || Number(count[1]) !== values.length) {
    throw new StatementFormatError('Hyundai source array length mismatch')
  }
  return values
}

export function parseHyundai(text: string): CardStatementResult {
  const context = statementContext(text)
  const rows: TransactionRecord[] = []
  let declared: number | null = null
  let declaredFee: number | null = null
  let declaredCount: number | null = null
  let fees = 0

  hyundaiData(text).forEach((a, index) => {
    if (!a[1]) {
      if (a[4].startsWith('총합계')) {
        declared = amount(a[8])
        declaredFee = amount(a[9]) ?? 0
        const match = /^총합계(\d+)건$/.exec(a[4])
        declaredCount = match ? Number(match[1]) : null
      }
      return
    }
    if (!/^\d{6}$/.test(a[1])) {
      throw new StatementFormatError('Hyundai dated row not recognized')
    }

    const original = amount(a[5])
    const billed = amount(a[8])
    const fee = amount(a[9])
    const row = record(
      'hyundai',
      `arUseDesc:${index}`,
      a[1],
      a[4],
      original,
      billed,
      context,
      {
        fee_krw: fee,
        card_label: a[3],
        installment_months: amount(a[6]) || null,
        installment_round: amount(a[7]) || null,
      },
    )
    if (original === 0 && billed === 0) {
      row.kind = 'adjustment_reference'
    }
    rows.push(row)
    fees += fee ?? 0
  })

  const result = finish(context, rows, declared, fees, 0, declaredFee)
  const purchases = rows.filter((row) => row.kind !== 'adjustment_reference').length
  result.validation.purchase_row_count = purchases
  result.validation.declared_purchase_count = declaredCount
  result.validation.purchase_count_matches = purchases === declaredCount
  if (declaredCount !== purchases) {
    result.status = 'needs_review'
  }

  result.references = cancellationReferences(text)
  result.warnings.push(
    'Auxiliary foreign details are excluded; cancellations need original-transaction linkage.',
  )
  return result
}

function cancellationReferences(text: string): Record<string, unknown>[] {
  const $ = loadDocument(text)
  const references: Record<string, unknown>[] = []

  for (const table of $('table').toArray()) {
    const rows = tableRows($, table)
    const head = rows
      .slice(0, 2)
      .map((row) => clean(textContent(row)))
      .join(' ')
    if (!['취소일', '취소금액'].every((label) => head.includes(label))) {
      continue
    }

    for (const tr of rows.slice(1)) {
      let c = cells($, tr)
      if (c.length === 11 && [1, 3, 5, 7, 9].every((j) => c[j] === '')) {
        c = c.filter((_, j) => j % 2 === 0)
      }
      if (c.length === 6 && /^20\d{2}\.\d{2}\.\d{2}$/.test(c[0])) {
        references.push({
          kind: 'cancellation_reference',
          cancel_date: c[0],
          original_date: c[1],
          merchant: c[3],
          amount_krw: amount(c[4]),
          posting_status: 'requires_linkage',
        })
      }
    }
  }
  return references
}
