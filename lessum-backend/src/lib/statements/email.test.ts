import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { MAX_BYTES, PARSER_VERSION, attachSource, parseAttachment, parseEmail } from './email.js'
import { StatementFormatError } from './errors.js'
import { buildEmail, lotteFixture, lotteFixtureEucKr } from './fixtures.js'
import { encryptVestmail } from './test-support.js'

const html = (content = lotteFixture()) => Buffer.from(content)

async function expectFormatError(run: () => Promise<unknown>, message: RegExp) {
  await assert.rejects(
    run(),
    (error: unknown) =>
      error instanceof StatementFormatError && message.test(error.message),
  )
}

describe('parseEmail', () => {
  it('HTML 첨부 1개를 읽어 파싱하고 출처 정보를 붙인다', async () => {
    const data = buildEmail([{ filename: 'statement.html', content: html() }])
    const result = await parseEmail(data, 'lotte')

    assert.equal(result.status, 'parsed')
    assert.equal(result.issuer, 'lotte')
    assert.equal(result.source_format, 'email')
    assert.equal(result.parser_version, PARSER_VERSION)
    assert.match(result.source_sha256!, /^[0-9a-f]{64}$/)
    assert.match(result.attachment_sha256!, /^[0-9a-f]{64}$/)
    assert.equal(result.transactions.length, 3)
    assert.ok(result.transactions.every((row) => /^[0-9a-f]{64}$/.test(row.source_row_id!)))
  })

  it('첨부 내용이 같으면 메일이 다시 와도 행 ID가 같고, 같은 행끼리는 다르다', async () => {
    const attachment = [{ filename: 'statement.html', content: html() }]
    const first = await parseEmail(buildEmail(attachment), 'lotte')
    const second = await parseEmail(buildEmail(attachment, { Subject: 'resent' }), 'lotte')

    assert.deepEqual(
      first.transactions.map((row) => row.source_row_id),
      second.transactions.map((row) => row.source_row_id),
    )
    assert.notEqual(first.source_sha256, second.source_sha256)
    assert.equal(first.attachment_sha256, second.attachment_sha256)
    assert.notEqual(first.transactions[0].source_row_id, first.transactions[1].source_row_id)
  })

  it('첨부 내용이 달라지면 행 ID도 달라진다', async () => {
    const first = await parseEmail(buildEmail([{ filename: 'a.html', content: html() }]), 'lotte')
    const second = await parseEmail(
      buildEmail([{ filename: 'a.html', content: html(lotteFixture({ amount1: '' })) }]),
      'lotte',
    )

    assert.notEqual(first.transactions[0].source_row_id, second.transactions[0].source_row_id)
  })

  it('HTML 첨부가 없거나 둘 이상이면 거부한다', async () => {
    await expectFormatError(
      () => parseEmail(buildEmail([]), 'lotte'),
      /exactly one HTML statement attachment/,
    )
    await expectFormatError(
      () =>
        parseEmail(
          buildEmail([
            { filename: 'a.html', content: html() },
            { filename: 'b.htm', content: html() },
          ]),
          'lotte',
        ),
      /exactly one HTML statement attachment/,
    )
  })

  it('HTML이 아닌 첨부는 무시한다', async () => {
    const data = buildEmail([
      { filename: 'notice.pdf', content: 'pdf', contentType: 'application/pdf' },
      { filename: 'statement.HTM', content: html() },
    ])

    assert.equal((await parseEmail(data, 'lotte')).status, 'parsed')
  })

  it('인코딩된 한글 파일명(RFC 2047)도 인식한다', async () => {
    const name = `=?UTF-8?B?${Buffer.from('명세서').toString('base64')}?=.html`
    const data = buildEmail([{ filename: name, content: html() }])

    assert.equal((await parseEmail(data, 'lotte')).status, 'parsed')
  })

  it('EUC-KR 첨부를 charset 매개변수, 메타 태그, 폴백 순서로 해석한다', async () => {
    const body = lotteFixtureEucKr()
    assert.throws(() => new TextDecoder('utf-8', { fatal: true }).decode(body))

    const cases = [
      ['charset 매개변수', body, 'text/html; charset="euc-kr"'],
      ['cp949 별칭', body, 'text/html; charset="cp949"'],
      ['잘못된 charset(utf-8) 선언 후 폴백', body, 'text/html; charset="utf-8"'],
      ['charset 없음', body, 'text/html'],
      [
        '메타 태그',
        Buffer.concat([Buffer.from('<meta charset="euc-kr">'), body]),
        'text/html',
      ],
    ] as const

    for (const [name, content, contentType] of cases) {
      const result = await parseEmail(
        buildEmail([{ filename: 'statement.html', content, contentType }]),
        'lotte',
      )

      assert.equal(result.status, 'parsed', name)
      assert.equal(result.transactions[0].merchant, '같은상점', name)
    }
  })

  it('20 MiB를 넘는 메일은 파싱하지 않는다', async () => {
    await expectFormatError(
      () => parseEmail(new Uint8Array(MAX_BYTES + 1), 'lotte'),
      /exceeds 20 MiB/,
    )
  })

  it('지원하지 않는 카드사는 거부한다', async () => {
    await expectFormatError(
      () => parseEmail(buildEmail([{ filename: 'a.html', content: html() }]), 'unknown'),
      /Unsupported issuer/,
    )
  })

  it('암호화된 첨부는 비밀번호가 없으면 password_required를 반환한다', async () => {
    const encrypted = encryptVestmail(lotteFixture())
    const data = buildEmail([{ filename: 'a.html', content: encrypted }])

    for (const password of [undefined, null, '']) {
      const result = await parseEmail(data, 'lotte', password)

      assert.equal(result.status, 'password_required')
      assert.deepEqual(result.transactions, [])
    }
  })

  it('암호화된 첨부는 올바른 비밀번호로 복호화해 파싱한다', async () => {
    const data = buildEmail([
      { filename: 'a.html', content: encryptVestmail(lotteFixture(), 'pw-123') },
    ])

    const result = await parseEmail(data, 'lotte', 'pw-123')

    assert.equal(result.status, 'parsed')
    assert.equal(result.transactions.length, 3)
    await expectFormatError(() => parseEmail(data, 'lotte', 'wrong'), /Password incorrect/)
  })
})

describe('parseAttachment / attachSource', () => {
  it('평문 HTML은 비밀번호 없이 파싱한다', () => {
    assert.equal(parseAttachment('lotte', lotteFixture()).status, 'parsed')
  })

  it('행 ID는 카드사·첨부 해시·원본 행 번호로 결정된다', () => {
    const raw = Buffer.from('attachment-bytes')
    const make = (issuer: string) =>
      attachSource(parseAttachment('lotte', lotteFixture()), issuer, Buffer.from('mail'), raw, 'email')

    assert.deepEqual(
      make('lotte').transactions.map((row) => row.source_row_id),
      make('lotte').transactions.map((row) => row.source_row_id),
    )
    assert.notEqual(make('lotte').transactions[0].source_row_id, make('woori').transactions[0].source_row_id)
  })
})
