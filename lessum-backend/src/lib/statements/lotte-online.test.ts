import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { StatementFormatError } from './errors.js'
import { buildEmail } from './fixtures.js'
import {
  LOTTE_ACCOUNT_PATH,
  LOTTE_CERT_PATH,
  LOTTE_DETAIL_PATH,
  LOTTE_ENTRY_PATH,
  LOTTE_ORIGIN,
  LOTTE_STATEMENT_PATH,
  LOTTE_VERIFY_PATH,
  billMonths,
  collectLotteEmail,
  createLotteHttp,
  hasLotteStatementLink,
  parseLotteDetail,
  selectBillMonth,
  statementEntryUrl,
  subjectPaymentDate,
  type LotteHttp,
  type LotteRequest,
} from './lotte-online.js'

const BIRTH = '000101'
const ENTRY = `${LOTTE_ORIGIN}${LOTTE_ENTRY_PATH}?p=SYNTHETICTOKEN`
const TRACKING = `https://lcpush.lottecard.co.kr/tms-msg-api/tracking?p_id=1&URL=${ENTRY}`
const SUBJECT = '[롯데카드] 테스트님의 2026년 11월 14일 롯데 신용카드 이용대금 명세서입니다.'
const CONTEXT = { payment_date: '2026-11-14', statement_month: '2026-11' }

function linkHtml(href = TRACKING, text = '명세서 확인하기') {
  return `<html><body><p>11월 이용대금 명세서</p><a href="${href}">${text}</a><a href="${href}"><img></a></body></html>`
}

function htmlEmail(html: string, subject = SUBJECT): Buffer {
  const encoded = Buffer.from(html).toString('base64').replace(/(.{76})/g, '$1\r\n')
  return Buffer.from(
    [
      'From: email_center@lottecard.co.kr',
      'To: user@naver.com',
      `Subject: =?UTF-8?B?${Buffer.from(subject).toString('base64')}?=`,
      'MIME-Version: 1.0',
      'Content-Type: text/html; charset="utf-8"',
      'Content-Transfer-Encoding: base64',
      '',
      encoded,
    ].join('\r\n'),
  )
}

interface Item {
  merchant: string
  date: string
  plan: string
  billed: string
  intmt?: string
  slam?: string
  prn: string
  fee?: string
}

function item({ merchant, date, plan, billed, intmt = '-', slam = '-', prn, fee = '-' }: Item) {
  const planHtml = plan === '일시불' ? '<span>일시불</span>' : `<span><span>${plan}</span></span>`
  return `<li class="toggle">
    <strong>${merchant}</strong>
    <div class="info"><span>${date}</span>${planHtml}<span>본인</span><span>테스트카드(1*2*)</span></div>
    <em>${billed}</em>
    <div class="toggleCont useList"><ul class="infoDataS col03">
      <li>할부회차<span id="specintmt">${intmt}</span></li>
      <li>이용총액<span id="specslam">${slam}</span></li>
      <li>청구원금<span id="specbilprn">${prn}</span></li>
      <li>수수료(이자)<span id="specbilfe">${fee}</span></li>
      <li>적립예정 포인트<span id="specptnm">-</span></li>
      <li>결제 후 잔액<span id="specafbilbal">-</span></li>
    </ul></div>
  </li>`
}

const INSTALLMENT: Item = {
  merchant: '테스트에스테틱',
  date: '2026.08.18',
  plan: '할부(2/2)',
  billed: '291,351원',
  intmt: '2 /2',
  slam: '575,000원',
  prn: '287,500원',
  fee: '3,851원',
}
const LUMP: Item = { merchant: '테스트카페', date: '2026.10.06', plan: '일시불', billed: '20,500원', prn: '20,500원' }

function detailHtml(items: Item[] = [INSTALLMENT, LUMP], count = items.length) {
  return `<div class="totArea"><p class="tot">총 ${count} 건</p><span class="totPrice">0원</span></div>
    <ul class="useCardList type02">${items.map(item).join('')}</ul>`
}

function statementPage(bilDt = '20261114', totBilAm = '311851') {
  const list = JSON.stringify([
    { bilDt, accnoDc: '01', mbrno: 'SYNTH==', totBilAm, bilCnt: '1', bilRowNum: '1' },
    { bilDt: '20261014', accnoDc: '01', mbrno: 'SYNTH==', totBilAm: '1000', bilCnt: '1', bilRowNum: '2' },
  ]).replaceAll('=', '\\u003d')
  return `<script>var billMonthList = [];\nbillMonthList = JSON.parse('${list}');</script>`
}

const ok = (extra: Record<string, unknown> = {}) =>
  JSON.stringify({ Status: { code: 0, msgCode: 'STATUS.Ok', message: '정상' }, ...extra })

type Handler = (request: LotteRequest) => { status?: number; body: string }

function official(overrides: Partial<Record<string, Handler>> = {}) {
  const seen: LotteRequest[] = []
  const handlers: Record<string, Handler> = {
    [LOTTE_ENTRY_PATH]: () => ({ body: '<form><input type="password" name="birth"></form>' }),
    [LOTTE_VERIFY_PATH]: () => ({ body: ok({ inCno: 'SYNTHETIC-CNO', v3TK: '', v3CD: '' }) }),
    [LOTTE_CERT_PATH]: () => ({ body: ok() }),
    [LOTTE_STATEMENT_PATH]: () => ({ body: statementPage() }),
    [LOTTE_ACCOUNT_PATH]: () => ({
      body: ok({ Content: '<input name="unit" value="U1"><input name="amex" value="0">', Param: {} }),
    }),
    [LOTTE_DETAIL_PATH]: () => ({ body: ok({ Content: detailHtml() }) }),
    ...overrides,
  }
  const http: LotteHttp = {
    async send(request) {
      seen.push(request)
      const handler = handlers[new URL(request.url, LOTTE_ORIGIN).pathname]
      assert.ok(handler, `unexpected request ${request.url}`)
      const { status = 200, body } = handler(request)
      return { status, body }
    },
  }
  return { http, seen }
}

describe('statementEntryUrl', () => {
  it('트래킹 링크에서 공식 명세서 주소를 꺼낸다', () => {
    assert.equal(statementEntryUrl(linkHtml()), ENTRY)
  })

  it('트래킹 링크의 * 구분자를 &로 복원한다', () => {
    const href = `https://lcpush.lottecard.co.kr/tms-msg-api/tracking?URL=${LOTTE_ORIGIN}${LOTTE_ENTRY_PATH}?p=A*x=1`
    assert.equal(statementEntryUrl(linkHtml(href)), `${LOTTE_ORIGIN}${LOTTE_ENTRY_PATH}?p=A&x=1`)
  })

  it('공식 도메인이 아닌 목적지는 거부한다', () => {
    const href = `https://lcpush.lottecard.co.kr/tms-msg-api/tracking?URL=https://evil.example${LOTTE_ENTRY_PATH}?p=A`
    assert.throws(() => statementEntryUrl(linkHtml(href)), StatementFormatError)
  })

  it('명세서 진입 경로가 아니면 거부한다', () => {
    const href = `https://lcpush.lottecard.co.kr/tms-msg-api/tracking?URL=${LOTTE_ORIGIN}/app/LPMAIAA_V100.lc?p=A`
    assert.throws(() => statementEntryUrl(linkHtml(href)), StatementFormatError)
  })

  it('명세서 링크가 없으면 거부한다', () => {
    assert.throws(() => statementEntryUrl(linkHtml(TRACKING, '홈페이지')), StatementFormatError)
  })
})

describe('subjectPaymentDate', () => {
  it('제목에서 결제일을 읽는다', () => {
    assert.equal(subjectPaymentDate(SUBJECT), '20261114')
  })

  it('결제일이 없으면 거부한다', () => {
    assert.throws(() => subjectPaymentDate('롯데카드 안내'), StatementFormatError)
  })
})

describe('billMonths / selectBillMonth', () => {
  it('페이지의 명세서 목록에서 메일 결제일 항목을 고른다', () => {
    const month = selectBillMonth(billMonths(statementPage()), '20261114')
    assert.deepEqual(month, { bilDt: '20261114', accnoDc: '01', mbrno: 'SYNTH==', totBilAm: '311851' })
  })

  it('결제일 항목이 없으면 거부한다', () => {
    assert.throws(() => selectBillMonth(billMonths(statementPage()), '20261214'), StatementFormatError)
  })

  it('목록이 없으면 거부한다', () => {
    assert.throws(() => billMonths('<html></html>'), StatementFormatError)
  })
})

describe('parseLotteDetail', () => {
  it('할부와 일시불 거래를 금액·회차와 함께 읽는다', () => {
    const result = parseLotteDetail(detailHtml(), CONTEXT, 311851)
    assert.equal(result.status, 'parsed')
    const [installment, lump] = result.transactions
    assert.equal(installment.transaction_date, '2026-08-18')
    assert.equal(installment.merchant, '테스트에스테틱')
    assert.equal(installment.amount_krw, 575000)
    assert.equal(installment.billed_principal_krw, 287500)
    assert.equal(installment.fee_krw, 3851)
    assert.equal(installment.billed_amount_krw, 291351)
    assert.equal(installment.installment_round, 2)
    assert.equal(installment.installment_months, 2)
    assert.equal(lump.amount_krw, 20500)
    assert.equal(lump.installment_months, null)
    assert.equal(lump.requires_review, false)
    assert.equal(result.validation?.principal_matches, true)
  })

  it('명세서 총액과 다르면 확인 필요로 표시한다', () => {
    const result = parseLotteDetail(detailHtml(), CONTEXT, 311852)
    assert.equal(result.status, 'needs_review')
  })

  it('표시 건수와 다르면 확인 필요로 표시한다', () => {
    const result = parseLotteDetail(detailHtml([INSTALLMENT, LUMP], 3), CONTEXT, 311851)
    assert.equal(result.status, 'needs_review')
  })

  it('알 수 없는 결제 방식은 거부한다', () => {
    const html = detailHtml([{ ...LUMP, plan: '해외일시불' }])
    assert.throws(() => parseLotteDetail(html, CONTEXT, 20500), StatementFormatError)
  })

  it('결제 방식과 할부회차가 다르면 거부한다', () => {
    const html = detailHtml([{ ...INSTALLMENT, intmt: '1 /3' }])
    assert.throws(() => parseLotteDetail(html, CONTEXT, 291351), StatementFormatError)
  })

  it('청구원금과 수수료 합이 청구금액과 다르면 거부한다', () => {
    const html = detailHtml([{ ...LUMP, billed: '20,600원' }])
    assert.throws(() => parseLotteDetail(html, CONTEXT, 20600), StatementFormatError)
  })

  it('거래 목록이 없으면 거부한다', () => {
    assert.throws(() => parseLotteDetail('<div class="totArea">총 0 건</div>', CONTEXT, 0), StatementFormatError)
  })
})

describe('hasLotteStatementLink', () => {
  it('첨부 없이 명세서 링크만 있는 메일을 구분한다', async () => {
    assert.equal(await hasLotteStatementLink(htmlEmail(linkHtml())), true)
  })

  it('HTML 첨부가 있는 기존 메일은 링크 방식으로 보지 않는다', async () => {
    const email = buildEmail([{ filename: 'LOTTECARD.html', content: '<html></html>' }])
    assert.equal(await hasLotteStatementLink(email), false)
  })
})

describe('collectLotteEmail', () => {
  it('생년월일 인증 후 메일 결제일의 명세서를 수집한다', async () => {
    const { http, seen } = official()
    const result = await collectLotteEmail(htmlEmail(linkHtml()), BIRTH, { lotteHttp: http })

    assert.equal(result.status, 'parsed')
    assert.equal(result.issuer, 'lotte')
    assert.equal(result.source_format, 'email_link_to_official_web')
    assert.equal(result.transactions.length, 2)
    assert.deepEqual(
      seen.map((request) => new URL(request.url, LOTTE_ORIGIN).pathname),
      [
        LOTTE_ENTRY_PATH,
        LOTTE_VERIFY_PATH,
        LOTTE_CERT_PATH,
        LOTTE_STATEMENT_PATH,
        LOTTE_ACCOUNT_PATH,
        LOTTE_DETAIL_PATH,
      ],
    )
    assert.equal(seen[1].form?.birth, BIRTH)
    assert.equal(seen[2].form?.enCno, 'SYNTHETIC-CNO')
    assert.equal(seen[5].form?.bilDt, '20261114')
    assert.equal(seen[5].form?.bllUnitNo, 'U1')
  })

  it('같은 명세서는 세션이 달라도 같은 원본 해시를 쓴다', async () => {
    const a = await collectLotteEmail(htmlEmail(linkHtml()), BIRTH, { lotteHttp: official().http })
    const b = await collectLotteEmail(htmlEmail(linkHtml(), `${SUBJECT} (재발송)`), BIRTH, {
      lotteHttp: official().http,
    })
    assert.equal(a.attachment_sha256, b.attachment_sha256)
  })

  it('생년월일이 없으면 요청 없이 입력 대기로 둔다', async () => {
    const { http, seen } = official()
    const result = await collectLotteEmail(htmlEmail(linkHtml()), null, { lotteHttp: http })
    assert.equal(result.status, 'password_required')
    assert.equal(result.credential_rejected, undefined)
    assert.equal(seen.length, 0)
  })

  it('생년월일 형식이 아니면 요청하지 않는다', async () => {
    const { http, seen } = official()
    const result = await collectLotteEmail(htmlEmail(linkHtml()), '12345', { lotteHttp: http })
    assert.equal(result.status, 'password_required')
    assert.equal(seen.length, 0)
  })

  it('인증이 거절되면 입력 대기로 돌리고 다음 단계로 가지 않는다', async () => {
    const { http, seen } = official({
      [LOTTE_VERIFY_PATH]: () => ({ body: JSON.stringify({ Status: { code: -1, message: '불일치' } }) }),
    })
    const result = await collectLotteEmail(htmlEmail(linkHtml()), BIRTH, { lotteHttp: http })
    assert.equal(result.status, 'password_required')
    assert.equal(result.credential_rejected, true)
    assert.equal(seen.length, 2)
  })

  it('링크가 만료돼 입력 화면이 없으면 거부한다', async () => {
    const { http } = official({ [LOTTE_ENTRY_PATH]: () => ({ body: '<html>만료</html>' }) })
    await assert.rejects(collectLotteEmail(htmlEmail(linkHtml()), BIRTH, { lotteHttp: http }), StatementFormatError)
  })

  it('결제 계좌가 여러 개면 거부한다', async () => {
    const { http } = official({
      [LOTTE_ACCOUNT_PATH]: () => ({
        body: ok({ Content: '<input name="unit" value="U1"><input name="unit" value="U2"><input name="amex"><input name="amex">' }),
      }),
    })
    await assert.rejects(collectLotteEmail(htmlEmail(linkHtml()), BIRTH, { lotteHttp: http }), StatementFormatError)
  })

  it('응답이 JSON이 아니면 거부한다', async () => {
    const { http } = official({ [LOTTE_DETAIL_PATH]: () => ({ body: '<html>error</html>' }) })
    await assert.rejects(collectLotteEmail(htmlEmail(linkHtml()), BIRTH, { lotteHttp: http }), StatementFormatError)
  })
})

describe('createLotteHttp', () => {
  it('공식 도메인 밖으로는 요청하지 않는다', async () => {
    let called = false
    const http = createLotteHttp(async () => {
      called = true
      return new Response('')
    })
    await assert.rejects(http.send({ method: 'GET', url: 'https://evil.example/' }), StatementFormatError)
    assert.equal(called, false)
  })

  it('받은 쿠키를 다음 요청에 보낸다', async () => {
    const cookies: (string | null)[] = []
    const http = createLotteHttp(async (_url, init) => {
      cookies.push(new Headers(init?.headers).get('cookie'))
      return new Response('ok', { headers: { 'set-cookie': 'SID=abc; Path=/' } })
    })
    await http.send({ method: 'GET', url: ENTRY })
    await http.send({ method: 'POST', url: LOTTE_VERIFY_PATH, form: { birth: BIRTH }, ajax: true })
    assert.deepEqual(cookies, [null, 'SID=abc'])
  })
})
