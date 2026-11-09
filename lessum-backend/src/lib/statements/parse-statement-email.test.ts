import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { buildEmail, lotteFixture, wooriFixture } from './fixtures.js'
import { LOGIN_URL, PAGE } from './official-client.js'
import { parseStatementEmail } from './parse-statement-email.js'
import { createSamsungHttp } from './official-client.js'
import { encryptVestmail } from './test-support.js'

describe('parseStatementEmail', () => {
  it('롯데·우리는 첨부 해석 경로로 처리한다', async () => {
    const lotte = buildEmail([{ filename: 'a.html', content: lotteFixture() }])
    const woori = buildEmail([{ filename: 'a.html', content: encryptVestmail(wooriFixture(), 'pw') }])

    assert.equal((await parseStatementEmail(lotte, 'lotte')).status, 'parsed')
    assert.equal((await parseStatementEmail(woori, 'woori', 'pw')).status, 'parsed')
    assert.equal((await parseStatementEmail(woori, 'woori')).status, 'password_required')
  })

  it('삼성은 온라인 조회 경로로 처리한다', async () => {
    const requested: string[] = []
    const http = createSamsungHttp((async (input: URL | string) => {
      requested.push(String(input))
      return new Response('<html>no</html>', { status: 200 })
    }) as typeof fetch)
    const form = `<html><form method="POST" action="${LOGIN_URL}"><input name="pvalue" value="x"><input name="_command" value="login"></form></html>`
    const data = buildEmail([{ filename: 'a.html', content: encryptVestmail(form, 'pw') }], {
      From: 'billing@samsungcard.com',
    })

    await assert.rejects(parseStatementEmail(data, 'samsung', 'pw', { http }), /not accepted; renewal may be required/)
    assert.deepEqual(requested, [LOGIN_URL])
    assert.ok(!requested.includes(PAGE))
  })

  it('지원하지 않는 카드사는 거부한다', async () => {
    await assert.rejects(
      parseStatementEmail(buildEmail([{ filename: 'a.html', content: lotteFixture() }]), 'kb'),
      /Unsupported issuer/,
    )
  })
})
