import assert from 'node:assert/strict'
import { createHash } from 'node:crypto'
import { before, describe, it } from 'node:test'

import { StatementFormatError } from './errors.js'
import { buildEmail } from './fixtures.js'
import {
  EXPORT_URL,
  LOGIN_URL,
  PAGE,
  SUMMARY_URL,
  createSamsungHttp,
} from './official-client.js'
import { SamsungExportError } from './samsung-export.js'
import { sheetsFixture, xlsxFromSheets } from './samsung-fixtures.js'
import {
  SAMSUNG_SENDER,
  authorize,
  collectSamsungEmail,
  controlReference,
  downloadExport,
  fetchReference,
  requestPayload,
  samsungEmailAttachment,
  sourceAccess,
} from './samsung-online.js'
import { buildZip, encryptVestmail } from './test-support.js'
import { SamsungValidation } from './statement.js'

const PASSWORD = 'test-only'
const LANDING = '<html><input id="sessionStr" value="0,SYNTHETIC,01,20261013"></html>'
const ACCESS = { bilMngtNoEncr: 'SYNTHETIC', bilMngtNoDvC: '01', stlmDt: '20261013' }

let workbook: Buffer
before(async () => {
  workbook = await xlsxFromSheets(sheetsFixture())
})

const form = (action = LOGIN_URL) =>
  `<!DOCTYPE html><html><body><form method="POST" action="${action}"><input name="pvalue" value="SYNTHETIC"><input name="_command" value="login"></form><img src="https://example.org/tracker"></body></html>`

function emailFixture({
  sender = SAMSUNG_SENDER,
  subject = '2026년 10월 13일 이용대금 명세서',
  html = form(),
  password = PASSWORD,
}: { sender?: string; subject?: string; html?: string; password?: string } = {}) {
  return buildEmail([{ filename: 'statement.html', content: encryptVestmail(html, password) }], {
    From: sender,
    Subject: `=?UTF-8?B?${Buffer.from(subject).toString('base64')}?=`,
  })
}

function controlFixture(patch: Record<string, unknown> = {}): Record<string, unknown> {
  const one = { cptSlYn: 'N', slDt: '20260902', mrcNm: '같은상점', slAm: 100, bilPcam: 90, bilInt: 0, bilFe: 0 }
  return {
    common: { procsRsDvC: '0' },
    procsFpyCnt: '2',
    procsIstmCnt: '1',
    procsFrnUDtlCt: '1',
    procsStlmCanIzCt: '1',
    bDBDTBBLD001DVO: { stlmDt: '20261013', bilMngtNoDvC: '01', fpyUseAm: 180, istmUseAm: 100, prdptAm: 0, totBilAm: 280 },
    rvoFpyCnt: '0', rvoStmCdLnCnt: '0', stmCdLnCnt: '0', cdlnCnt: '0', istmFnnCnt: '0', crdPrtctnPdCnt: '0', ancsCnt: '0',
    fpyList: [one, { cptSlYn: 'Y' }, { ...one }],
    istmList: [{ cptSlYn: 'N', slDt: '20260902', mrcNm: '할부상점', slAm: 300, bilPcam: 100, bilInt: 0, bilFe: 0 }],
    ...patch,
  }
}

type Handler = (request: { url: string; method: string; body: string }) => Response | Promise<Response>
interface Seen { url: string; method: string; headers: Record<string, string>; body: string }

function official(overrides: Partial<Record<'login' | 'page' | 'summary' | 'export', Handler>> = {}) {
  const seen: Seen[] = []
  const handlers: Record<string, Handler> = {
    [LOGIN_URL]: () =>
      new Response("<script>location.href='/personal/statement/card/UBLDRP0201P4.jsp';</script>", {
        status: 200,
        headers: { 'set-cookie': 'JSESSIONID=abc; Path=/; HttpOnly' },
      }),
    [PAGE]: () => new Response(LANDING, { status: 200, headers: { 'content-type': 'text/html; charset=utf-8' } }),
    [SUMMARY_URL]: () => Response.json(controlFixture()),
    [EXPORT_URL]: () => new Response(new Uint8Array(workbook), { status: 200 }),
  }
  if (overrides.login) handlers[LOGIN_URL] = overrides.login
  if (overrides.page) handlers[PAGE] = overrides.page
  if (overrides.summary) handlers[SUMMARY_URL] = overrides.summary
  if (overrides.export) handlers[EXPORT_URL] = overrides.export

  const fetchImpl = (async (input: URL | string, init?: RequestInit) => {
    const url = String(input)
    const request = { url, method: init?.method ?? 'GET', body: String(init?.body ?? '') }
    seen.push({ ...request, headers: { ...(init?.headers as Record<string, string>) } })
    const handler = handlers[url]
    assert.ok(handler, `예상하지 못한 접속 대상: ${url}`)
    return handler(request)
  }) as typeof fetch
  return { http: createSamsungHttp(fetchImpl), seen }
}

async function expectFormatError(run: () => unknown, message: RegExp) {
  await assert.rejects(
    Promise.resolve().then(run),
    (error: unknown) => error instanceof StatementFormatError && message.test(error.message),
  )
}

describe('sourceAccess', () => {
  it('세션 문자열에서 조회 정보를 읽고 스크립트는 실행하지 않는다 (원본 Python 테스트)', () => {
    const fields = sourceAccess(
      '<html><input id="sessionStr" value="0,SYNTHETIC,01,20261013"><script>throw Error()</script></html>',
    )

    assert.equal(fields.stlmDt, '20261013')
    assert.equal(fields.bilMngtNoEncr, 'SYNTHETIC')
    assert.equal(fields.bilMngtNoDvC, '01')
  })

  it('개별 입력란 세 개가 있으면 그것을 우선 사용하고 퍼센트 인코딩을 푼다', () => {
    const html = '<input id="bilMngtNoEncr" value="AB%2BC%3D%ED%95%9C"><input id="bilMngtNoDvC" value="01"><input id="stlmDt" value="20261013"><input id="sessionStr" value="0,OTHER,01,20200101">'

    assert.deepEqual(sourceAccess(html), { bilMngtNoEncr: 'AB+C=한', bilMngtNoDvC: '01', stlmDt: '20261013' })
  })

  it('세션 문자열의 값도 퍼센트 디코딩하고, 잘못된 인코딩은 그대로 둔다', () => {
    assert.equal(sourceAccess('<input id="sessionStr" value="0,a%2Fb%zz,01,20261013">').bilMngtNoEncr, 'a/b%zz')
  })

  it('조회 정보가 없거나 형식이 다르면 거부한다', () => {
    const cases = [
      '<html></html>',
      '<input id="sessionStr" value="0,A,01">',
      '<input id="sessionStr" value="0,A,01,20261013,extra">',
      '<input id="sessionStr" value="0,,01,20261013">',
      '<input id="sessionStr" value="0,A,,20261013">',
      '<input id="sessionStr" value="0,A,01,">',
      '<input id="sessionStr" value="0,A,01,20261013"><input id="sessionStr" value="0,B,01,20261013">',
    ]
    for (const html of cases) {
      assert.throws(() => sourceAccess(html), SamsungExportError, html)
    }
  })

  it('검증된 개인 신용 명세서가 아니거나 날짜 형식이 다르면 거부한다', () => {
    assert.throws(() => sourceAccess('<input id="sessionStr" value="0,A,02,20261013">'), /verified personal-credit/)
    assert.throws(() => sourceAccess('<input id="sessionStr" value="0,A,01,2026-10-13">'), /verified personal-credit/)
  })

  it('조회 값이 512자를 넘으면 거부한다', () => {
    assert.throws(() => sourceAccess(`<input id="sessionStr" value="0,${'a'.repeat(513)},01,20261013">`), /Unexpected access field size/)
    assert.doesNotThrow(() => sourceAccess(`<input id="sessionStr" value="0,${'a'.repeat(512)},01,20261013">`))
  })
})

describe('requestPayload', () => {
  it('한국 시간 기준 공통 부문과 조회 정보를 순서대로 담는다', () => {
    const payload = requestPayload(ACCESS, new Date('2026-10-13T15:04:05.678Z'))

    assert.deepEqual(Object.keys(payload), ['batHistSeqn', 'bilMngtNo', 'bilMngtNoEncr', 'bilMngtNoDvC', 'stlmDt', 'common'])
    assert.deepEqual(payload.common, {
      dlngEvnDvC: 'S',
      scrnId: 'UBLDRP0201M0',
      stdEtxtCrtDt: '20261014',
      stdEtxtCrtSysNm: 'P0000023',
      stdEtxtSn: '00040567800001',
      stdEtxtPrgDvNo: 0,
      stdEtxtPrgNo: 0,
      indvInfIncYn: 'N',
      usid: ' ',
    })
  })

  it('시간 일련번호는 항상 14자리이다', () => {
    const sn = (requestPayload(ACCESS, new Date('2026-01-01T03:00:00.001Z')).common as Record<string, string>).stdEtxtSn

    assert.equal(sn.length, 14)
    assert.equal(sn, '12000000100001')
  })
})

describe('downloadExport', () => {
  it('고정된 공식 주소의 내보내기 서비스만 호출하고 조회 정보를 주소에 싣지 않는다 (원본 Python 테스트)', async () => {
    const { http, seen } = official()
    const result = await downloadExport(LANDING, http, new Date('2026-10-13T00:00:00Z'))

    assert.deepEqual(result, workbook)
    assert.equal(seen.length, 1)
    assert.equal(seen[0].url, 'https://bill.samsungcard.com/frontservice/exceldownload')
    assert.equal(seen[0].method, 'POST')
    assert.equal(seen[0].headers.Origin, 'https://bill.samsungcard.com')
    assert.equal(seen[0].headers.Referer, PAGE)
    assert.equal(seen[0].headers['Content-Type'], 'application/x-www-form-urlencoded')

    const form = new URLSearchParams(seen[0].body)
    assert.equal(form.get('serviceId'), 'SBLDRP0201S41')
    assert.equal(JSON.parse(form.get('payload')!).stlmDt, '20261013')
    assert.ok(!seen[0].url.includes('SYNTHETIC'))
  })

  it('XLSX가 아닌 응답이나 상태 코드 오류, 손상된 ZIP은 거부한다', async () => {
    await assert.rejects(
      downloadExport(LANDING, official({ export: () => new Response('<html>login</html>') }).http),
      /Server did not return XLSX/,
    )
    await assert.rejects(
      downloadExport(LANDING, official({ export: () => new Response('x', { status: 500 }) }).http),
      /Official export returned HTTP 500/,
    )
    await assert.rejects(
      downloadExport(LANDING, official({ export: () => new Response(Buffer.concat([Buffer.from('PK\x03\x04'), Buffer.alloc(40)])) }).http),
      /Invalid XLSX archive/,
    )
    await assert.rejects(
      downloadExport(LANDING, official({ export: () => new Response(new Uint8Array(buildZip([{ name: 'a.txt' }]))) }).http),
      /not an XLSX workbook/,
    )
  })

  it('20 MiB를 넘는 응답은 거부한다', async () => {
    const big = new Uint8Array(20 * 1024 * 1024 + 1)
    big.set([0x50, 0x4b, 0x03, 0x04])

    await assert.rejects(
      downloadExport(LANDING, official({ export: () => new Response(big) }).http),
      /exceeds 20 MiB/,
    )
  })

  it('네트워크 오류 메시지에 접속 정보를 노출하지 않는다 (원본 Python 테스트)', async () => {
    const failing = createSamsungHttp((async () => {
      throw new Error('SENSITIVE-ACCESS-IN-ERROR')
    }) as typeof fetch)

    await assert.rejects(
      downloadExport(LANDING, failing),
      (error: unknown) =>
        error instanceof SamsungExportError &&
        /connection failed/.test(error.message) &&
        !error.message.includes('SENSITIVE'),
    )
  })

  it('조회 정보가 없는 페이지로는 요청하지 않는다', async () => {
    const { http, seen } = official()

    await assert.rejects(downloadExport('<html></html>', http), /access fields missing/)
    assert.equal(seen.length, 0)
  })
})

describe('samsungEmailAttachment', () => {
  it('발신자가 삼성카드이고 HTML 첨부가 하나이면 읽는다', async () => {
    const result = await samsungEmailAttachment(emailFixture())

    assert.equal(result.subject, '2026년 10월 13일 이용대금 명세서')
    assert.match(result.html, /VestMail/)
  })

  it('발신자가 다르면 거부한다', async () => {
    await expectFormatError(() => samsungEmailAttachment(emailFixture({ sender: 'phisher@example.com' })), /sender does not match/)
    await expectFormatError(
      () => samsungEmailAttachment(emailFixture({ sender: `${SAMSUNG_SENDER}.evil.test` })),
      /sender does not match/,
    )
  })

  it('발신자 대소문자는 구분하지 않는다', async () => {
    await assert.doesNotReject(samsungEmailAttachment(emailFixture({ sender: SAMSUNG_SENDER.toUpperCase() })))
  })

  it('HTML 첨부가 없거나 여러 개이면 거부한다', async () => {
    await expectFormatError(() => samsungEmailAttachment(buildEmail([], { From: SAMSUNG_SENDER })), /Expected one Samsung statement HTML attachment/)
  })
})

describe('authorize', () => {
  it('복호화한 양식의 두 필드만 공식 로그인 주소로 보내고, 쿠키를 유지해 진입 페이지를 연다', async () => {
    const { http, seen } = official()
    const { html } = await samsungEmailAttachment(emailFixture())
    const landing = await authorize(html, PASSWORD, http)

    assert.equal(landing, LANDING)
    assert.equal(seen.length, 2)
    assert.equal(seen[0].url, LOGIN_URL)
    assert.equal(seen[0].method, 'POST')
    assert.equal(new URLSearchParams(seen[0].body).get('pvalue'), 'SYNTHETIC')
    assert.equal(new URLSearchParams(seen[0].body).get('_command'), 'login')
    assert.equal([...new URLSearchParams(seen[0].body).keys()].length, 2)
    assert.equal(seen[1].url, PAGE)
    assert.equal(seen[1].headers.Referer, LOGIN_URL)
    assert.equal(seen[1].headers.Cookie, 'JSESSIONID=abc')
  })

  it('첨부가 인증을 다른 주소로 보내게 할 수 없다 (원본 Python 테스트)', async () => {
    const { http, seen } = official()
    const html = encryptVestmail(form('https://example.org/steal'), PASSWORD)

    await expectFormatError(() => authorize(html, PASSWORD, http), /Unrecognized Samsung email authorization form/)
    assert.equal(seen.length, 0)
  })

  it('양식 구성이 다르면 접속하지 않고 거부한다', async () => {
    const bad = [
      form().replace('method="POST"', 'method="GET"'),
      form() + form(),
      form().replace('<input name="_command" value="login">', ''),
      form().replace('value="login"', 'value="logout"'),
      form().replace('name="pvalue" value="SYNTHETIC"', 'name="pvalue" value=""'),
      form().replace('<input name="_command"', '<input name="extra" value="1"><input name="_command"'),
      form().replace('name="pvalue" value="SYNTHETIC"', `name="pvalue" value="${'a'.repeat(16385)}"`),
      '<html><body>양식 없음</body></html>',
    ]
    for (const html of bad) {
      const { http, seen } = official()

      await expectFormatError(() => authorize(encryptVestmail(html, PASSWORD), PASSWORD, http), /Unrecognized Samsung email authorization/)
      assert.equal(seen.length, 0)
    }
  })

  it('비밀번호가 틀리면 접속하지 않는다', async () => {
    const { http, seen } = official()

    await expectFormatError(() => authorize(encryptVestmail(form(), PASSWORD), 'wrong', http), /Password incorrect/)
    assert.equal(seen.length, 0)
  })

  it('공식 서버가 접속 정보를 받아들이지 않으면 갱신이 필요하다고 알린다', async () => {
    const { http, seen } = official({ login: () => new Response('<html>session expired</html>') })

    await expectFormatError(() => authorize(encryptVestmail(form(), PASSWORD), PASSWORD, http), /not accepted; renewal may be required/)
    assert.equal(seen.length, 1)
  })

  it('상태 코드 오류와 진입 페이지의 조회 정보 누락을 거부한다', async () => {
    await expectFormatError(
      () => authorize(encryptVestmail(form(), PASSWORD), PASSWORD, official({ login: () => new Response('x', { status: 403 }) }).http),
      /Samsung official request returned HTTP 403/,
    )
    await expectFormatError(
      () => authorize(encryptVestmail(form(), PASSWORD), PASSWORD, official({ page: () => new Response('<html></html>') }).http),
      /access fields missing/,
    )
  })

  it('실패 메시지에 접속 정보(pvalue)를 담지 않는다', async () => {
    const attempts = [
      official({ login: () => new Response('<html>no</html>') }),
      official({ login: () => new Response('x', { status: 500 }) }),
    ]
    for (const { http } of attempts) {
      await assert.rejects(authorize(encryptVestmail(form(), PASSWORD), PASSWORD, http), (error: unknown) =>
        error instanceof Error && !error.message.includes('SYNTHETIC'),
      )
    }
  })
})

describe('controlReference', () => {
  it('공식 요약을 비교 기준으로 바꾼다', () => {
    const reference = controlReference(controlFixture(), ACCESS)

    assert.deepEqual(reference.context, { payment_date: '2026-10-13', statement_month: '2026-10' })
    assert.equal(reference.transactions.length, 3)
    assert.deepEqual(reference.transactions[0], {
      transaction_date: '2026-09-02',
      merchant: '같은상점',
      original_amount: 100,
      billed_amount_krw: 90,
    })
    assert.deepEqual(reference.validation.sections, { D0: { declared_count: 2 }, D1: { declared_count: 1 }, DE: { declared_count: 1 } })
    assert.deepEqual(reference.validation.declared_summary_krw, { 일시불: 180, 할부: 100, 미리입금하신금액: 0 })
    assert.equal(reference.validation.declared_grand_total_krw, 280)
    assert.equal(reference.official_cancellation_count, 1)
  })

  it('추가 혜택 행(cptSlYn=Y)은 구매로 세지 않는다', () => {
    assert.equal(controlReference(controlFixture(), ACCESS).transactions.length, 3)
  })

  it('요약 날짜가 이메일 진입 날짜와 다르면 거부한다 (원본 Python 테스트)', () => {
    assert.throws(() => controlReference(controlFixture(), { ...ACCESS, stlmDt: '20261113' }), /does not match the email entry/)
  })

  it('요청 실패, 지원하지 않는 유형, 추가 금융상품은 거부한다', () => {
    assert.throws(() => controlReference(controlFixture({ common: { procsRsDvC: '1' } }), ACCESS), /summary request failed/)
    assert.doesNotThrow(() => controlReference(controlFixture({ common: { procsRsDvC: 0 } }), ACCESS))
    assert.throws(
      () => controlReference(controlFixture({ bDBDTBBLD001DVO: { ...(controlFixture().bDBDTBBLD001DVO as object), bilMngtNoDvC: '02' } }), ACCESS),
      /Unsupported statement type/,
    )
    for (const key of ['rvoFpyCnt', 'rvoStmCdLnCnt', 'stmCdLnCnt', 'cdlnCnt', 'istmFnnCnt', 'crdPrtctnPdCnt', 'ancsCnt']) {
      assert.throws(() => controlReference(controlFixture({ [key]: '1' }), ACCESS), /Additional financial products/, key)
    }
    assert.throws(() => controlReference(controlFixture({ adtCsbList: [{ x: 1 }] }), ACCESS), /Additional financial products/)
  })

  it('필수 값이 없거나 음수이거나 형식이 다르면 거부한다', () => {
    assert.throws(() => controlReference(controlFixture({ procsFpyCnt: undefined }), ACCESS), /Required monetary cell is blank/)
    assert.throws(() => controlReference(controlFixture({ procsFpyCnt: '-1' }), ACCESS), /Invalid official statement counts/)
    assert.throws(() => controlReference(controlFixture({ fpyList: 'x' }), ACCESS), /schema changed/)
    assert.throws(() => controlReference(null, ACCESS), /schema changed/)
    assert.throws(() => controlReference([], ACCESS), /schema changed/)
    assert.throws(() => controlReference(controlFixture({ bDBDTBBLD001DVO: null }), ACCESS), /schema changed/)
  })

  it('합산 표현이 확인되지 않은 행은 거부한다', () => {
    const bad = controlFixture({ fpyList: [{ cptSlYn: 'X' }] })

    assert.throws(() => controlReference(bad, ACCESS), /Unverified combined-purchase representation/)
  })

  it('구매가 있다고 하면서 비교할 거래가 없으면 거부한다', () => {
    const bad = controlFixture({ fpyList: [{ cptSlYn: 'Y' }], istmList: [] })

    assert.throws(() => controlReference(bad, ACCESS), /no comparison transactions/)
  })

  it('구매가 없는 명세서는 거래 없이도 통과한다', () => {
    const empty = controlFixture({ procsFpyCnt: '0', procsIstmCnt: '0', fpyList: [], istmList: [], bDBDTBBLD001DVO: { stlmDt: '20261013', bilMngtNoDvC: '01', fpyUseAm: 0, istmUseAm: 0, prdptAm: 0, totBilAm: 0 } })

    assert.equal(controlReference(empty, ACCESS).transactions.length, 0)
  })

  it('요약 항목의 합이 총액과 다르면 거부한다', () => {
    const bad = controlFixture({ bDBDTBBLD001DVO: { stlmDt: '20261013', bilMngtNoDvC: '01', fpyUseAm: 180, istmUseAm: 100, prdptAm: 0, totBilAm: 281 } })

    assert.throws(() => controlReference(bad, ACCESS), /Unmapped summary adjustments/)
  })

  it('청구 금액은 원금, 이자, 수수료를 합한다', () => {
    const row = { cptSlYn: 'N', slDt: '20260902', mrcNm: '상점', slAm: 100, bilPcam: 80, bilInt: 7, bilFe: 3 }
    const reference = controlReference(controlFixture({ fpyList: [row], procsFpyCnt: '1' }), ACCESS)

    assert.equal(reference.transactions[0].billed_amount_krw, 90)
  })
})

describe('fetchReference', () => {
  it('공식 요약 서비스에 JSON을 보내고 응답을 해석한다', async () => {
    const { http, seen } = official()
    const reference = await fetchReference(LANDING, http, new Date('2026-10-13T00:00:00Z'))

    assert.equal(reference.official_cancellation_count, 1)
    assert.equal(seen[0].url, SUMMARY_URL)
    assert.equal(seen[0].headers['Content-Type'], 'application/json; charset=UTF-8')
    const payload = JSON.parse(seen[0].body)
    assert.equal(payload.stlmDt, '20261013')
    assert.equal(payload.crtlPgeNo, 1)
    assert.equal(payload.expsrListEcn, 10)
    assert.equal(payload.stlmDtEnc, '')
  })

  it('JSON이 아니거나 상태 코드가 오류이면 거부한다', async () => {
    await expectFormatError(() => fetchReference(LANDING, official({ summary: () => new Response('<html>') }).http), /schema changed/)
    await expectFormatError(() => fetchReference(LANDING, official({ summary: () => new Response('x', { status: 502 }) }).http), /returned HTTP 502/)
  })
})

describe('collectSamsungEmail', () => {
  it('이메일 첨부만으로 공식 서버에서 전체 명세서를 받아 검증한다 (원본 Python 테스트)', async () => {
    const data = emailFixture()
    const { http, seen } = official()
    const result = await collectSamsungEmail(data, PASSWORD, { http })

    assert.equal(result.status, 'parsed')
    assert.equal(result.transactions.length, 3)
    assert.equal(result.collection?.saved_html_used, false)
    assert.equal(result.collection?.imap_verified, false)
    assert.equal(result.collection?.email_attachment_only_verified, true)
    assert.equal(result.collection?.method, 'email_attachment_to_official_export')
    assert.equal(result.collection?.workbook_sha256, createHash('sha256').update(workbook).digest('hex'))
    assert.equal((result.validation as SamsungValidation).cancellation_count_matches, true)
    assert.equal(result.source_format, 'email_to_official_export')
    assert.equal(result.source_sha256, createHash('sha256').update(data).digest('hex'))

    assert.deepEqual(seen.map((request) => request.url), [LOGIN_URL, PAGE, SUMMARY_URL, EXPORT_URL])
    assert.ok(seen.every((request) => request.url.startsWith('https://bill.samsungcard.com/')))
    assert.ok(seen.slice(1).every((request) => request.headers.Cookie === 'JSESSIONID=abc'))
    assert.ok(!JSON.stringify(result).includes('SYNTHETIC'))
  })

  it('첨부 파일 내용으로 행 ID가 정해진다 (메일 헤더가 달라도 같다)', async () => {
    const a = await collectSamsungEmail(emailFixture(), PASSWORD, { http: official().http })
    const b = await collectSamsungEmail(emailFixture({ subject: '2026년 10월 13일 이용대금 명세서 (재발송)' }), PASSWORD, { http: official().http })

    assert.deepEqual(a.transactions.map((t) => t.source_row_id), b.transactions.map((t) => t.source_row_id))
    assert.notEqual(a.source_sha256, b.source_sha256)
    assert.equal(a.attachment_sha256, b.attachment_sha256)
  })

  it('비밀번호가 없으면 접속하지 않고 password_required이다', async () => {
    const { http, seen } = official()

    for (const password of [undefined, null, '']) {
      const result = await collectSamsungEmail(emailFixture(), password, { http })

      assert.equal(result.status, 'password_required')
      assert.deepEqual(result.transactions, [])
    }
    assert.equal(seen.length, 0)
  })

  it('메일 제목의 날짜가 공식 명세서 날짜와 다르면 거부한다', async () => {
    const { http, seen } = official()

    await expectFormatError(
      () => collectSamsungEmail(emailFixture({ subject: '2026년 11월 13일 이용대금 명세서' }), PASSWORD, { http }),
      /Email subject and official statement dates differ/,
    )
    assert.ok(!seen.some((request) => request.url === EXPORT_URL))
  })

  it('제목에 날짜가 없으면 날짜 대조를 건너뛴다', async () => {
    const result = await collectSamsungEmail(emailFixture({ subject: '이용대금 명세서' }), PASSWORD, { http: official().http })

    assert.equal(result.status, 'parsed')
  })

  it('공식 취소 건수와 내보내기의 취소 건수가 다르면 미완료이다', async () => {
    const { http } = official({ summary: () => Response.json(controlFixture({ procsStlmCanIzCt: '2' })) })
    const result = await collectSamsungEmail(emailFixture(), PASSWORD, { http })
    const validation = result.validation as SamsungValidation

    assert.equal(validation.cancellation_count_matches, false)
    assert.equal(validation.complete, false)
    assert.equal(result.status, 'needs_review')
  })

  it('공식 요약과 내보내기의 건수가 다르면 미완료이다', async () => {
    const { http } = official({ summary: () => Response.json(controlFixture({ procsFpyCnt: '3', fpyList: [...(controlFixture().fpyList as object[]), { cptSlYn: 'N', slDt: '20260902', mrcNm: '없는상점', slAm: 1, bilPcam: 1, bilInt: 0, bilFe: 0 }], bDBDTBBLD001DVO: { stlmDt: '20261013', bilMngtNoDvC: '01', fpyUseAm: 181, istmUseAm: 100, prdptAm: 0, totBilAm: 281 } })) })
    const result = await collectSamsungEmail(emailFixture(), PASSWORD, { http })

    assert.equal(result.status, 'needs_review')
  })

  it('발신자가 다른 메일은 접속하지 않고 거부한다', async () => {
    const { http, seen } = official()

    await expectFormatError(() => collectSamsungEmail(emailFixture({ sender: 'x@example.com' }), PASSWORD, { http }), /sender does not match/)
    assert.equal(seen.length, 0)
  })

  it('비밀번호가 틀리면 접속하지 않는다', async () => {
    const { http, seen } = official()

    await expectFormatError(() => collectSamsungEmail(emailFixture(), 'wrong', { http }), /Password incorrect/)
    assert.equal(seen.length, 0)
  })

  it('공식 서버가 거부하면 해당 단계의 상태 코드로 알린다', async () => {
    await expectFormatError(
      () => collectSamsungEmail(emailFixture(), PASSWORD, { http: official({ summary: () => new Response('x', { status: 500 }) }).http }),
      /Samsung official request returned HTTP 500/,
    )
    await expectFormatError(
      () => collectSamsungEmail(emailFixture(), PASSWORD, { http: official({ export: () => new Response('x', { status: 404 }) }).http }),
      /Official export returned HTTP 404/,
    )
  })

  it('네트워크 오류는 접속 정보 없이 일반 메시지로 바꾼다', async () => {
    const failing = createSamsungHttp((async () => {
      throw new Error('SENSITIVE-ACCESS-IN-ERROR pvalue=SYNTHETIC')
    }) as typeof fetch)

    await assert.rejects(collectSamsungEmail(emailFixture(), PASSWORD, { http: failing }), (error: unknown) =>
      error instanceof StatementFormatError &&
      /Samsung official connection or file operation failed/.test(error.message) &&
      !/SENSITIVE|SYNTHETIC/.test(error.message),
    )
  })

  it('다른 출처로 리다이렉트되면 거부하고 그 주소로 요청하지 않는다', async () => {
    const requested: string[] = []
    const http = createSamsungHttp((async (input: URL | string) => {
      requested.push(String(input))
      return new Response(null, { status: 302, headers: { location: 'https://example.org/receive' } })
    }) as typeof fetch)

    await assert.rejects(collectSamsungEmail(emailFixture(), PASSWORD, { http }), /Cross-origin export redirect refused/)
    assert.deepEqual(requested, [LOGIN_URL])
  })
})
