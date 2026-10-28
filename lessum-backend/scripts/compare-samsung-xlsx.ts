import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { attachSource } from '../src/lib/statements/email.js'
import { parseSamsungXlsx, type SamsungReference } from '../src/lib/statements/samsung.js'
import { compareResults, describeMismatch } from './compare-utils.js'

const dir = resolve(process.cwd(), '../../outputs/email-import-private')
const xlsx = readFileSync(resolve(dir, 'samsung-full.xlsx'))
const expected = JSON.parse(readFileSync(resolve(dir, 'samsung-full.json'), 'utf8'))
const reference = JSON.parse(
  readFileSync(resolve(dir, 'samsung-rendered.json'), 'utf8'),
) as SamsungReference

const result = attachSource(
  await parseSamsungXlsx(xlsx, reference),
  'samsung',
  xlsx,
  xlsx,
  'samsung_xlsx_export',
)
const legacyKey = expected.validation.saved_excerpt_matches
if (legacyKey !== undefined) {
  expected.validation.comparison_excerpt_matches = legacyKey
  delete expected.validation.saved_excerpt_matches
  console.log('  (참고) 저장된 Python 결과는 이전 키 이름 saved_excerpt_matches를 사용해 comparison_excerpt_matches로 대응시켰습니다.')
}
const comparison = compareResults(result, expected)
const summary = describeMismatch(comparison)

console.log('삼성 XLSX (오프라인): TypeScript 파서 결과 vs Python 결과')
console.log(`  상태: ${result.status} (Python: ${expected.status})`)
console.log(`  거래 행 수: ${comparison.rows[0]} (Python: ${comparison.rows[1]})`)
console.log(`  참고 내역 수: ${result.references.length} (Python: ${expected.references.length})`)
console.log(`  최상위 필드 불일치: ${summary.top}`)
console.log(`  행 필드 불일치: ${summary.rows}`)
process.exitCode = summary.failed ? 2 : 0
