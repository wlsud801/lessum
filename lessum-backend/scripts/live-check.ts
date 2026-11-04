import 'dotenv/config'

import { ApiError } from '../src/lib/errors.js'
import { decodeImapUtf7 } from '../src/lib/imap-utf7.js'
import {
  isNaverEmail,
  listNaverMailboxes,
  verifyNaverLogin,
} from '../src/lib/naver-imap.js'

const email = process.env.NAVER_TEST_EMAIL?.trim() ?? ''
const appPassword = process.env.NAVER_TEST_APP_PASSWORD ?? ''
const mailbox = process.env.NAVER_TEST_MAILBOX?.trim() ?? ''

const mask = (value: string) => `${value.slice(0, 2)}***@naver.com`

function report(error: unknown) {
  if (error instanceof ApiError) {
    console.log(`  실패: ${error.code} (HTTP ${error.status})`)
    console.log(`  메시지: ${error.message}`)
  } else {
    console.log('  실패: 분류되지 않은 오류', error instanceof Error ? error.name : '')
  }
}

console.log('[환경변수]')
console.log(`  NAVER_TEST_EMAIL: ${email ? `설정됨 (${isNaverEmail(email) ? mask(email) : '네이버 주소 형식이 아님'})` : '없음'}`)
console.log(`  NAVER_TEST_APP_PASSWORD: ${appPassword ? `설정됨 (${appPassword.length}자)` : '없음'}`)
console.log(`  NAVER_TEST_MAILBOX: ${mailbox ? '설정됨' : '없음 (선택)'}`)

if (!isNaverEmail(email) || !appPassword) {
  console.log('\n필수 값이 없거나 형식이 올바르지 않아 중단합니다. 네이버에는 접속하지 않았습니다.')
  process.exit(1)
}

console.log('\n[1] 로그인 검증 (LOGIN → LOGOUT)')
try {
  await verifyNaverLogin(email, appPassword)
  console.log('  성공')
} catch (error) {
  report(error)
  process.exit(1)
}

console.log('\n[2] 메일함 목록 조회 (LIST만, 메일 본문은 읽지 않음)')
try {
  const mailboxes = await listNaverMailboxes(email, appPassword)
  console.log(`  성공: 선택 가능한 메일함 ${mailboxes.length}개`)

  let decodeMismatch = 0
  for (const item of mailboxes) {
    let decoded: string | null = null
    try {
      decoded = decodeImapUtf7(item.imap_name)
    } catch {
      decoded = null
    }
    if (decoded !== item.name) {
      decodeMismatch += 1
    }
    const raw = item.imap_name === item.name ? '' : `  (원본: ${item.imap_name})`
    console.log(`   - ${item.name}${raw}`)
  }
  console.log(`  디코더 검증: 서버가 준 이름과 ${decodeMismatch === 0 ? '모두 일치' : `${decodeMismatch}개 불일치`}`)

  if (mailbox) {
    const found = mailboxes.find((item) => item.imap_name === mailbox)
    console.log(`  NAVER_TEST_MAILBOX: ${found ? `목록에 있음 → ${found.name}` : '목록에 없음'}`)
  }
} catch (error) {
  report(error)
  process.exit(1)
}
