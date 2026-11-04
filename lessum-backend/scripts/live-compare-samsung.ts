import 'dotenv/config'

import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { ImapFlow } from 'imapflow'

import { collectSamsungEmail } from '../src/lib/statements/samsung-online.js'
import { compareResults, describeMismatch } from './compare-utils.js'

const ALLOW_FLAG = '--allow-samsung-request'
const REFERENCE = resolve(
  process.cwd(),
  '../../outputs/email-import-private/naver-live-check/samsung-mail.json',
)

console.log('삼성카드 온라인 조회 실서버 비교')
console.log('  1) 네이버 메일함에서 Python이 처리했던 같은 삼성카드 메일 1통을 읽기 전용으로 가져옵니다.')
console.log('  2) 첨부의 조회 정보를 bill.samsungcard.com(삼성카드 공식 서버)에 전송해 전체 명세서를 받습니다.')
console.log('  3) 결과를 Python 결과와 행 단위로 비교합니다. 가맹점명·금액 값은 출력하지 않습니다.')

if (!process.argv.includes(ALLOW_FLAG)) {
  console.log(`\n${ALLOW_FLAG} 플래그가 없어 아무것도 접속하지 않았습니다.`)
  console.log(`실행하려면: npx tsx scripts/live-compare-samsung.ts ${ALLOW_FLAG}`)
  process.exit(0)
}

const email = process.env.NAVER_TEST_EMAIL?.trim() ?? ''
const appPassword = process.env.NAVER_TEST_APP_PASSWORD ?? ''
const statementPassword = process.env.STATEMENT_PASSWORD_SAMSUNG ?? ''
if (!email || !appPassword || !statementPassword) {
  console.log(
    `\n필요한 설정이 비어 있습니다. NAVER_TEST_EMAIL: ${Boolean(email)}, NAVER_TEST_APP_PASSWORD: ${Boolean(appPassword)}, STATEMENT_PASSWORD_SAMSUNG: ${Boolean(statementPassword)}`,
  )
  process.exit(1)
}

type Json = Record<string, unknown>
const reference = JSON.parse(readFileSync(REFERENCE, 'utf8')) as Json & {
  collection: { mailbox: { folder: string; uidvalidity: string; uid: string } } & Json
}
const target = reference.collection.mailbox

const client = new ImapFlow({
  host: 'imap.naver.com',
  port: 993,
  secure: true,
  auth: { user: email, pass: appPassword },
  logger: false,
})
client.on('error', () => undefined)

try {
  await client.connect()
  const lock = await client.getMailboxLock(target.folder, { readOnly: true })
  let source: Buffer | null = null
  try {
    console.log('\n[1] 메일함 열기 (읽기 전용 EXAMINE)')
    console.log(`  UIDVALIDITY 일치: ${String(client.mailbox && client.mailbox.uidValidity) === target.uidvalidity}`)
    const message = await client.fetchOne(target.uid, { source: true }, { uid: true })
    source = message && message.source ? message.source : null
  } finally {
    lock.release()
  }

  if (!source) {
    console.log('  Python이 처리한 UID의 메일이 더 이상 없습니다.')
    process.exit(1)
  }
  const identical = createHash('sha256').update(source).digest('hex') === reference.source_sha256
  console.log(`[2] 같은 UID 메일 수신: 원본 해시 ${identical ? '일치 (바이트 동일)' : '불일치'}`)
  if (!identical) {
    console.log('  다른 메일이므로 삼성카드 서버에 접속하지 않고 중단합니다.')
    process.exit(1)
  }

  console.log('[3] 삼성카드 공식 서버 조회 (조회 정보 전송)')
  const result = await collectSamsungEmail(source, statementPassword)
  const collection = result.collection ?? {}
  const ignored = new Set(['imap_verified', 'mailbox', 'end_to_end_complete'])
  const collectionMismatch = Object.keys({ ...collection, ...reference.collection })
    .filter((key) => !ignored.has(key))
    .filter((key) => JSON.stringify(collection[key]) !== JSON.stringify(reference.collection[key]))

  const comparison = compareResults(result, reference)
  const summary = describeMismatch(comparison)
  console.log(`  상태: ${result.status} (Python: ${reference.status})`)
  console.log(`  거래 행 수: ${comparison.rows[0]} (Python: ${comparison.rows[1]})`)
  console.log(`  최상위 필드 불일치: ${summary.top}`)
  console.log(`  행 필드 불일치: ${summary.rows}`)
  console.log(`  수집 메타 불일치: ${collectionMismatch.length ? collectionMismatch.join(', ') : '없음'}`)
  process.exitCode = summary.failed ? 2 : 0
} catch (error) {
  const code = (error as { code?: string }).code
  console.log(`실패: ${(error as Error).name}: ${(error as Error).message}${code ? ` (${code})` : ''}`)
  process.exitCode = 1
} finally {
  await client.logout().catch(() => client.close())
}
