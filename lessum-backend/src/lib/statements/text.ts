import { decodeHTML } from 'entities'

import { isValidDateString } from '../collect-schedule.js'
import { StatementFormatError } from './errors.js'

const PYTHON_WHITESPACE =
  /[\t\n\v\f\r\x1c-\x1f \x85\xa0\u1680\u2000-\u200a\u2028\u2029\u202f\u205f\u3000]+/
const META_CHARSET_PATTERN = /charset\s*=\s*["']?([\w-]+)/i
const CHARSET_ALIASES: Record<string, string> = {
  cp949: 'euc-kr',
  ms949: 'euc-kr',
  uhc: 'euc-kr',
  'x-windows-949': 'euc-kr',
}

export interface DateContext {
  payment_date?: string | null
}

export type DateBasis = 'explicit' | 'inferred_from_payment_date'

export function clean(value: string): string {
  return decodeHTML(value).split(PYTHON_WHITESPACE).filter(Boolean).join(' ')
}

export function amount(value: string): number | null {
  const text = clean(value)
    .replaceAll(',', '')
    .replaceAll('원', '')
    .replaceAll('−', '-')
    .trim()

  if (text === '' || text === '-' || text === '—') {
    return null
  }
  if (!/^-?\d+$/.test(text) || !Number.isSafeInteger(Number(text))) {
    throw new StatementFormatError(
      'Unsupported monetary value; do not coerce it to zero',
    )
  }
  return Number(text)
}

export function decodeHtml(
  data: Uint8Array,
  charset?: string | null,
): string {
  const head = Buffer.from(data.subarray(0, 4096)).toString('latin1')
  const meta = META_CHARSET_PATTERN.exec(head)
  const encodings = [charset, meta?.[1], 'utf-8', 'euc-kr']

  for (const encoding of encodings) {
    if (!encoding) {
      continue
    }
    const label = CHARSET_ALIASES[encoding.toLowerCase()] ?? encoding
    try {
      return new TextDecoder(label, { fatal: true, ignoreBOM: true }).decode(
        data,
      )
    } catch {
      continue
    }
  }
  throw new StatementFormatError('Unknown HTML encoding')
}

function toIsoDate(year: number, month: number, day: number): string {
  const iso = [
    String(year).padStart(4, '0'),
    String(month).padStart(2, '0'),
    String(day).padStart(2, '0'),
  ].join('-')
  if (!isValidDateString(iso)) {
    throw new StatementFormatError('Unexpected transaction date')
  }
  return iso
}

export function parseDate(
  raw: string,
  context: DateContext,
): { date: string; basis: DateBasis } {
  const value = clean(raw)

  if (/^\d{8}$/.test(value)) {
    return {
      date: toIsoDate(
        Number(value.slice(0, 4)),
        Number(value.slice(4, 6)),
        Number(value.slice(6, 8)),
      ),
      basis: 'explicit',
    }
  }

  const full = /^(\d{2}|20\d{2})\s*[./-]\s*(\d{1,2})\s*[./-]\s*(\d{1,2})$/.exec(
    value,
  )
  if (full) {
    const year = Number(full[1])
    return {
      date: toIsoDate(year < 100 ? year + 2000 : year, Number(full[2]), Number(full[3])),
      basis: 'explicit',
    }
  }

  if (/^\d{6}$/.test(value)) {
    return {
      date: toIsoDate(
        2000 + Number(value.slice(0, 2)),
        Number(value.slice(2, 4)),
        Number(value.slice(4, 6)),
      ),
      basis: 'explicit',
    }
  }

  const monthDay = /^(\d{1,2})[./-](\d{1,2})$/.exec(value)
  if (!monthDay) {
    throw new StatementFormatError('Unexpected transaction date')
  }
  if (!context.payment_date || !isValidDateString(context.payment_date)) {
    throw new StatementFormatError('Statement payment date unavailable')
  }

  const [anchorYear, anchorMonth] = context.payment_date.split('-').map(Number)
  const month = Number(monthDay[1])
  return {
    date: toIsoDate(
      anchorYear - (month > anchorMonth ? 1 : 0),
      month,
      Number(monthDay[2]),
    ),
    basis: 'inferred_from_payment_date',
  }
}
