import 'dotenv/config'

import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { ImapFlow } from 'imapflow'

import { parseEmail } from '../src/lib/statements/email.js'
import { compareResults, describeMismatch } from './compare-utils.js'

const PASSWORD_ENV: Record<string, string | null> = {
  lotte: null,
  woori: 'STATEMENT_PASSWORD_WOORI',
  hyundai: 'STATEMENT_PASSWORD_HYUNDAI',
}

const issuer = process.argv[2] ?? ''
if (!(issuer in PASSWORD_ENV)) {
  console.log('사용법: npx tsx scripts/live-compare.ts <lotte|woori|hyundai>')
  process.exit(1)
}
const passwordEnv = PASSWORD_ENV[issuer]
const statementPassword = passwordEnv ? process.env[passwordEnv] : undefined

const REFERENCE = resolve(
  process.cwd(),
  `../../outputs/email-import-private/naver-other-cards-check/${issuer}/statement.json`,
)

const email = process.env.NAVER_TEST_EMAIL?.trim() ?? ''
const appPassword = process.env.NAVER_TEST_APP_PASSWORD ?? ''
if (!email || !appPassword) {
  console.log('NAVER_TEST_EMAIL / NAVER_TEST_APP_PASSWORD가 필요합니다.')
  process.exit(1)
}

type Json = Record<string, unknown>
const reference = JSON.parse(readFileSync(REFERENCE, 'utf8')) as Json & {
  collection: { mailbox: { folder: string; uidvalidity: string; uid: string } }
  transactions: Json[]
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
  try {
    const validity = String(client.mailbox && client.mailbox.uidValidity)
    console.log('[1] 메일함 열기 (읽기 전용 EXAMINE)')
    console.log(`  UIDVALIDITY 일치: ${validity === target.uidvalidity}`)

    const message = await client.fetchOne(target.uid, { source: true }, { uid: true })
    if (!message || !message.source) {
      console.log('  Python이 처리한 UID의 메일이 더 이상 없습니다.')
    } else {
      const sha = createHash('sha256').update(message.source).digest('hex')
      const identical = sha === reference.source_sha256
      console.log(`[2] 같은 UID 메일 수신: 원본 해시 ${identical ? '일치 (바이트 동일)' : '불일치'}`)

      if (identical) {
        console.log(
          `  명세서 암호(${passwordEnv ?? '불필요'}): ${
            passwordEnv ? (statementPassword ? '설정됨' : '비어 있음') : '불필요'
          }`,
        )
        const result = await parseEmail(message.source, issuer, statementPassword)
        const comparison = compareResults(result, reference)
        const summary = describeMismatch(comparison)
        console.log(`[3] ${issuer}: TypeScript 파서 결과 vs Python 결과`)
        console.log(`  상태: ${result.status} (Python: ${reference.status})`)
        console.log(`  거래 행 수: ${comparison.rows[0]} (Python: ${comparison.rows[1]})`)
        console.log(`  최상위 필드 불일치: ${summary.top}`)
        console.log(`  행 필드 불일치: ${summary.rows}`)
        process.exitCode = summary.failed ? 2 : 0
      }
    }
  } finally {
    lock.release()
  }
} catch (error) {
  const code = (error as { code?: string }).code
  console.log(`실패: ${(error as Error).name}${code ? ` (${code})` : ''}`)
  process.exitCode = 1
} finally {
  await client.logout().catch(() => client.close())
}
