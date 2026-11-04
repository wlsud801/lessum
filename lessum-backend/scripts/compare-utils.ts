import { deepStrictEqual } from 'node:assert/strict'

type Json = Record<string, unknown>

export const TOP_LEVEL_KEYS = [
  'status',
  'context',
  'references',
  'warnings',
  'validation',
  'issuer',
  'source_format',
  'source_sha256',
  'attachment_sha256',
]

function differs(actual: unknown, expected: unknown): boolean {
  try {
    deepStrictEqual(actual, expected)
    return false
  } catch {
    return true
  }
}

export function compareResults(actual: unknown, reference: Json) {
  const mine = JSON.parse(JSON.stringify(actual)) as Json & { transactions: Json[] }
  const referenceRows = reference.transactions as Json[]

  const topMismatch = TOP_LEVEL_KEYS.filter((key) => differs(mine[key], reference[key]))

  const rowMismatch = new Map<string, number>()
  const rowCount = Math.max(mine.transactions.length, referenceRows.length)
  for (let i = 0; i < rowCount; i++) {
    const a = mine.transactions[i]
    const b = referenceRows[i]
    if (!a || !b) {
      rowMismatch.set('(행 누락)', (rowMismatch.get('(행 누락)') ?? 0) + 1)
      continue
    }
    for (const key of new Set([...Object.keys(a), ...Object.keys(b)])) {
      if (differs(a[key], b[key])) {
        rowMismatch.set(key, (rowMismatch.get(key) ?? 0) + 1)
      }
    }
  }
  return {
    topMismatch,
    rowMismatch,
    rows: [mine.transactions.length, referenceRows.length] as const,
  }
}

export function describeMismatch(result: ReturnType<typeof compareResults>) {
  return {
    top: result.topMismatch.length ? result.topMismatch.join(', ') : '없음',
    rows: result.rowMismatch.size
      ? [...result.rowMismatch].map(([key, count]) => `${key}(${count}행)`).join(', ')
      : '없음 (모든 행의 모든 필드 일치, source_row_id 포함)',
    failed: result.topMismatch.length > 0 || result.rowMismatch.size > 0,
  }
}
