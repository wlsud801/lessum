import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import {
  PAGE,
  SamsungTransportError,
  createSamsungHttp,
  resolveOfficialRedirect,
} from './official-client.js'
import { SamsungExportError } from './samsung-export.js'

interface Seen {
  method: string
  url: string
  headers: Record<string, string>
  body: string | undefined
}

function scripted(...responses: (Response | (() => Response))[]) {
  const seen: Seen[] = []
  const queue = [...responses]
  const fetchImpl = (async (input: URL | string, init?: RequestInit) => {
    seen.push({
      method: init?.method ?? 'GET',
      url: String(input),
      headers: { ...(init?.headers as Record<string, string>) },
      body: init?.body as string | undefined,
    })
    const next = queue.shift()
    if (!next) {
      throw new Error('예상하지 못한 요청')
    }
    return typeof next === 'function' ? next() : next
  }) as typeof fetch
  return { fetchImpl, seen }
}

const ok = (body = 'ok', headers: Record<string, string | string[]> = {}) => {
  const response = new Response(body, { status: 200 })
  for (const [key, value] of Object.entries(headers)) {
    for (const item of Array.isArray(value) ? [value].flat() : [value]) {
      response.headers.append(key, item)
    }
  }
  return response
}
const redirect = (status: number, location: string) =>
  new Response(null, { status, headers: { location } })

async function expectRefused(run: () => Promise<unknown>) {
  await assert.rejects(
    run(),
    (error: unknown) =>
      error instanceof SamsungExportError && /Cross-origin export redirect refused/.test(error.message),
  )
}

describe('resolveOfficialRedirect', () => {
  it('같은 출처의 절대·상대 주소를 허용한다', () => {
    assert.equal(resolveOfficialRedirect('/a/b', PAGE).href, 'https://bill.samsungcard.com/a/b')
    assert.equal(
      resolveOfficialRedirect('https://bill.samsungcard.com/x', PAGE).href,
      'https://bill.samsungcard.com/x',
    )
    assert.doesNotThrow(() => resolveOfficialRedirect('https://bill.samsungcard.com:443/x', PAGE))
  })

  it('다른 출처, http, 다른 포트, 계정 정보가 든 주소는 거부한다 (원본 Python 테스트 포함)', () => {
    for (const location of [
      'https://example.org/receive',
      'http://bill.samsungcard.com/x',
      'https://bill.samsungcard.com:8443/x',
      'https://user:pw@bill.samsungcard.com/x',
      'https://bill.samsungcard.com.evil.test/x',
      '//evil.test/x',
      'https://evil.test@bill.samsungcard.com.evil.test/',
    ]) {
      assert.throws(
        () => resolveOfficialRedirect(location, PAGE),
        (error: unknown) => error instanceof SamsungExportError,
        location,
      )
    }
  })
})

describe('createSamsungHttp', () => {
  it('고정된 출처가 아니면 요청을 보내지 않고 거부한다', async () => {
    const { fetchImpl, seen } = scripted(ok())

    await expectRefused(() =>
      createSamsungHttp(fetchImpl).send({ method: 'GET', url: 'https://example.org/' }),
    )
    assert.equal(seen.length, 0)
  })

  it('User-Agent와 지정한 헤더, 본문을 보낸다', async () => {
    const { fetchImpl, seen } = scripted(ok())
    const response = await createSamsungHttp(fetchImpl).send({
      method: 'POST',
      url: `${PAGE}?a=1`,
      headers: { 'Content-Type': 'application/json' },
      body: '{"x":1}',
    })

    assert.equal(response.status, 200)
    assert.equal(response.body.toString(), 'ok')
    assert.equal(seen[0].method, 'POST')
    assert.equal(seen[0].headers['User-Agent'], 'Mozilla/5.0')
    assert.equal(seen[0].headers['Content-Type'], 'application/json')
    assert.equal(seen[0].body, '{"x":1}')
  })

  it('GET 요청에는 본문을 붙이지 않는다', async () => {
    const { fetchImpl, seen } = scripted(ok())
    await createSamsungHttp(fetchImpl).send({ method: 'GET', url: PAGE, body: 'ignored' })

    assert.equal(seen[0].body, undefined)
  })

  it('쿠키를 저장해 이후 요청에 보내고, 만료시키면 지운다', async () => {
    const { fetchImpl, seen } = scripted(
      ok('1', { 'set-cookie': ['A=1; Path=/; HttpOnly', 'B=2; Secure'] }),
      ok('2', { 'set-cookie': 'A=9; Path=/' }),
      ok('3', { 'set-cookie': 'B=; Max-Age=0' }),
      ok('4'),
    )
    const http = createSamsungHttp(fetchImpl)
    for (let i = 0; i < 4; i++) {
      await http.send({ method: 'GET', url: PAGE })
    }

    assert.equal(seen[0].headers.Cookie, undefined)
    assert.equal(seen[1].headers.Cookie, 'A=1; B=2')
    assert.equal(seen[2].headers.Cookie, 'A=9; B=2')
    assert.equal(seen[3].headers.Cookie, 'A=9')
  })

  it('연결(인스턴스)마다 쿠키가 분리된다', async () => {
    const first = scripted(ok('1', { 'set-cookie': 'SESSION=secret' }))
    await createSamsungHttp(first.fetchImpl).send({ method: 'GET', url: PAGE })
    const second = scripted(ok())
    await createSamsungHttp(second.fetchImpl).send({ method: 'GET', url: PAGE })

    assert.equal(second.seen[0].headers.Cookie, undefined)
  })

  it('같은 출처 리다이렉트를 따라가고, 중간 응답의 쿠키도 보낸다', async () => {
    const { fetchImpl, seen } = scripted(
      new Response(null, { status: 302, headers: { location: '/next', 'set-cookie': 'S=1' } }),
      ok('done'),
    )
    const response = await createSamsungHttp(fetchImpl).send({ method: 'GET', url: PAGE })

    assert.equal(response.body.toString(), 'done')
    assert.equal(seen[1].url, 'https://bill.samsungcard.com/next')
    assert.equal(seen[1].headers.Cookie, 'S=1')
  })

  it('301/302/303 POST는 GET으로 바꾸고 본문과 Content-Type을 버린다', async () => {
    for (const status of [301, 302, 303]) {
      const { fetchImpl, seen } = scripted(redirect(status, '/next'), ok())
      await createSamsungHttp(fetchImpl).send({
        method: 'POST',
        url: PAGE,
        headers: { 'Content-Type': 'application/json', Referer: PAGE },
        body: '{"secret":1}',
      })

      assert.equal(seen[1].method, 'GET', String(status))
      assert.equal(seen[1].body, undefined, String(status))
      assert.equal(seen[1].headers['Content-Type'], undefined, String(status))
      assert.equal(seen[1].headers.Referer, PAGE, String(status))
    }
  })

  it('307/308은 메서드와 본문을 유지한다', async () => {
    const { fetchImpl, seen } = scripted(redirect(307, '/next'), ok())
    await createSamsungHttp(fetchImpl).send({ method: 'POST', url: PAGE, body: 'x=1' })

    assert.equal(seen[1].method, 'POST')
    assert.equal(seen[1].body, 'x=1')
  })

  it('다른 출처로의 리다이렉트는 거부하고 그 주소로 요청하지 않는다', async () => {
    const { fetchImpl, seen } = scripted(redirect(302, 'https://example.org/steal'), ok())

    await expectRefused(() => createSamsungHttp(fetchImpl).send({ method: 'GET', url: PAGE }))
    assert.equal(seen.length, 1)
  })

  it('리다이렉트가 너무 많으면 거부한다', async () => {
    const loop = () => redirect(302, '/again')
    const { fetchImpl, seen } = scripted(...Array.from({ length: 20 }, () => loop))

    await assert.rejects(
      createSamsungHttp(fetchImpl).send({ method: 'GET', url: PAGE }),
      /redirected too many times/,
    )
    assert.equal(seen.length, 11)
  })

  it('Location이 없는 3xx 응답은 그대로 돌려준다', async () => {
    const { fetchImpl } = scripted(new Response(null, { status: 302 }))
    const response = await createSamsungHttp(fetchImpl).send({ method: 'GET', url: PAGE })

    assert.equal(response.status, 302)
  })

  it('4xx/5xx 응답도 예외 없이 상태 코드로 돌려준다', async () => {
    const { fetchImpl } = scripted(new Response('err', { status: 503 }))
    const response = await createSamsungHttp(fetchImpl).send({ method: 'GET', url: PAGE })

    assert.equal(response.status, 503)
  })

  it('네트워크 오류는 상세 정보 없이 일반 오류로 바꾼다', async () => {
    const failing = (async () => {
      throw new Error('SENSITIVE-ACCESS-IN-ERROR https://bill.samsungcard.com/?pvalue=SECRET')
    }) as typeof fetch

    await assert.rejects(
      createSamsungHttp(failing).send({ method: 'GET', url: PAGE }),
      (error: unknown) =>
        error instanceof SamsungTransportError &&
        !/SENSITIVE|SECRET|samsungcard/.test(error.message),
    )
  })

  it('시간 제한을 넘기면 중단하고 일반 오류로 바꾼다', async () => {
    const hanging = ((_input: unknown, init?: RequestInit) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () => reject(new Error('aborted')))
      })) as typeof fetch

    await assert.rejects(
      createSamsungHttp(hanging, 30).send({ method: 'GET', url: PAGE }),
      SamsungTransportError,
    )
  })

  it('응답이 한도를 넘으면 읽기를 멈추고 한도보다 큰 본문을 돌려준다', async () => {
    let pulled = 0
    const stream = new ReadableStream<Uint8Array>({
      pull(controller) {
        pulled += 1
        controller.enqueue(new Uint8Array(1000))
        if (pulled > 1000) {
          controller.close()
        }
      },
    })
    const { fetchImpl } = scripted(new Response(stream, { status: 200 }))
    const response = await createSamsungHttp(fetchImpl).send({
      method: 'GET',
      url: PAGE,
      maxBytes: 2500,
    })

    assert.ok(response.body.length > 2500)
    assert.ok(pulled < 20, `너무 많이 읽음: ${pulled}`)
  })

  it('본문 읽기 중 오류도 일반 오류로 바꾼다', async () => {
    const broken = new ReadableStream<Uint8Array>({
      pull() {
        throw new Error('SENSITIVE-STREAM-ERROR')
      },
    })
    const { fetchImpl } = scripted(new Response(broken, { status: 200 }))

    await assert.rejects(
      createSamsungHttp(fetchImpl).send({ method: 'GET', url: PAGE }),
      (error: unknown) => error instanceof SamsungTransportError && !/SENSITIVE/.test(error.message),
    )
  })
})
