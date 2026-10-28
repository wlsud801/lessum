import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { ApiError } from './errors.js'
import {
  classifyLoginError,
  isNaverEmail,
  listNaverMailboxes,
  verifyNaverLogin,
  type ImapListClient,
  type ImapListEntry,
  type ImapLoginClient,
} from './naver-imap.js'

const RAW_SERVER_TEXT = 'RAW-SERVER-TEXT-MUST-NOT-LEAK'

function imapError(fields: Record<string, unknown>) {
  return Object.assign(new Error('Command failed'), fields)
}

describe('isNaverEmail', () => {
  it('네이버 주소만 받아들인다', () => {
    assert.ok(isNaverEmail('example@naver.com'))
    assert.ok(isNaverEmail('Example.Name+tag@NAVER.com'))
    assert.ok(!isNaverEmail('example@gmail.com'))
    assert.ok(!isNaverEmail('example@naver.com.evil.com'))
    assert.ok(!isNaverEmail('a b@naver.com'))
    assert.ok(!isNaverEmail('@naver.com'))
  })
})

describe('classifyLoginError', () => {
  const cases: [string, Record<string, unknown>, number, string][] = [
    [
      '로그인 횟수 제한',
      { authenticationFailed: true, responseText: 'Too many login failures' },
      429,
      'MAIL_LOGIN_RATE_LIMITED',
    ],
    [
      'IMAP 비활성화',
      { authenticationFailed: true, responseText: 'IMAP access is disabled' },
      422,
      'MAIL_IMAP_DISABLED',
    ],
    [
      '계정·비밀번호 불일치',
      { authenticationFailed: true, responseText: 'Incorrect ID or password' },
      422,
      'MAIL_INVALID_CREDENTIALS',
    ],
    [
      '알려진 응답 코드',
      { authenticationFailed: true, serverResponseCode: 'UNAVAILABLE' },
      422,
      'MAIL_AUTH_REJECTED',
    ],
    [
      '알 수 없는 인증 거부',
      { authenticationFailed: true, responseText: RAW_SERVER_TEXT },
      422,
      'MAIL_AUTH_REJECTED',
    ],
    ['ETHROTTLE', { code: 'ETHROTTLE' }, 429, 'MAIL_LOGIN_RATE_LIMITED'],
    ['연결 종료', { code: 'EConnectionClosed' }, 502, 'MAIL_CONNECTION_CLOSED'],
    ['연결 끊김', { code: 'NoConnection' }, 502, 'MAIL_CONNECTION_CLOSED'],
    ['DNS 실패', { code: 'ENOTFOUND' }, 502, 'MAIL_CONNECTION_FAILED'],
    ['타임아웃', { code: 'CONNECT_TIMEOUT' }, 502, 'MAIL_CONNECTION_FAILED'],
  ]

  for (const [name, fields, status, code] of cases) {
    it(`${name} → ${code}`, () => {
      const result = classifyLoginError(imapError(fields))

      assert.ok(result instanceof ApiError)
      assert.equal(result.status, status)
      assert.equal(result.code, code)
    })
  }

  it('서버 원문 응답을 메시지에 노출하지 않는다', () => {
    const result = classifyLoginError(
      imapError({ authenticationFailed: true, responseText: RAW_SERVER_TEXT }),
    )

    assert.ok(!result.message.includes(RAW_SERVER_TEXT))
  })

  it('원인을 알 수 없으면 비밀번호 오류로 단정하지 않는다', () => {
    const result = classifyLoginError(
      imapError({ authenticationFailed: true, responseText: RAW_SERVER_TEXT }),
    )

    assert.ok(result.message.includes('확정할 수 없습니다'))
  })

  it('인증 실패 표시가 없는 연결 오류는 인증 거부로 분류하지 않는다', () => {
    const result = classifyLoginError(imapError({ responseText: 'NO' }))

    assert.equal(result.code, 'MAIL_CONNECTION_FAILED')
  })

  it('Error가 아닌 값도 안전하게 처리한다', () => {
    assert.equal(classifyLoginError(undefined).code, 'MAIL_CONNECTION_FAILED')
    assert.equal(classifyLoginError('boom').code, 'MAIL_CONNECTION_FAILED')
    assert.equal(classifyLoginError(null).code, 'MAIL_CONNECTION_FAILED')
  })
})

describe('verifyNaverLogin', () => {
  function fakeClient(connect: () => Promise<void>) {
    const calls: string[] = []
    const client: ImapLoginClient = {
      connect: async () => {
        calls.push('connect')
        await connect()
      },
      logout: async () => {
        calls.push('logout')
      },
      close: () => {
        calls.push('close')
      },
      on: (event) => {
        calls.push(`on:${event}`)
      },
    }
    return { client, calls }
  }

  it('로그인에 성공하면 로그아웃만 하고 다른 명령은 보내지 않는다', async () => {
    const { client, calls } = fakeClient(async () => undefined)

    await verifyNaverLogin('a@naver.com', 'pw', () => client)

    assert.deepEqual(calls, ['on:error', 'connect', 'logout'])
  })

  it('팩토리에 이메일과 앱 비밀번호를 그대로 전달한다', async () => {
    const { client } = fakeClient(async () => undefined)
    let received: string[] = []

    await verifyNaverLogin('a@naver.com', 'my app pw', (email, password) => {
      received = [email, password]
      return client
    })

    assert.deepEqual(received, ['a@naver.com', 'my app pw'])
  })

  it('로그인에 실패하면 연결을 닫고 분류된 오류를 던진다', async () => {
    const { client, calls } = fakeClient(async () => {
      throw imapError({
        authenticationFailed: true,
        responseText: 'Incorrect ID or password',
      })
    })

    await assert.rejects(
      verifyNaverLogin('a@naver.com', 'pw', () => client),
      (error: unknown) =>
        error instanceof ApiError && error.code === 'MAIL_INVALID_CREDENTIALS',
    )
    assert.deepEqual(calls, ['on:error', 'connect', 'close'])
  })

  it('로그아웃이 실패해도 검증은 성공으로 처리하고 연결을 닫는다', async () => {
    const { client, calls } = fakeClient(async () => undefined)
    client.logout = async () => {
      calls.push('logout')
      throw new Error('logout failed')
    }

    await verifyNaverLogin('a@naver.com', 'pw', () => client)

    assert.deepEqual(calls, ['on:error', 'connect', 'logout', 'close'])
  })
})

describe('listNaverMailboxes', () => {
  const entry = (
    path: string,
    pathAsListed: string,
    flags: string[] = [],
  ): ImapListEntry => ({ path, pathAsListed, flags: new Set(flags) })

  function fakeListClient(options: {
    connect?: () => Promise<void>
    list?: () => Promise<ImapListEntry[]>
  }) {
    const calls: string[] = []
    const client: ImapListClient = {
      connect: async () => {
        calls.push('connect')
        await options.connect?.()
      },
      list: async (listOptions) => {
        calls.push(`list:${JSON.stringify(listOptions)}`)
        return options.list ? options.list() : []
      },
      logout: async () => {
        calls.push('logout')
      },
      close: () => {
        calls.push('close')
      },
      on: () => undefined,
    }
    return { client, calls }
  }

  it('디코딩된 이름과 원본 이름을 함께 반환한다', async () => {
    const { client } = fakeListClient({
      list: async () => [
        entry('INBOX', 'INBOX'),
        entry('청구·결제', '&zK2tbAC3rLDIHA-'),
      ],
    })

    const mailboxes = await listNaverMailboxes('a@naver.com', 'pw', () => client)

    assert.deepEqual(mailboxes, [
      { name: 'INBOX', imap_name: 'INBOX' },
      { name: '청구·결제', imap_name: '&zK2tbAC3rLDIHA-' },
    ])
  })

  it('선택할 수 없는 메일함은 제외한다', async () => {
    const { client } = fakeListClient({
      list: async () => [
        entry('INBOX', 'INBOX', ['\\HasNoChildren']),
        entry('Folders', 'Folders', ['\\Noselect', '\\HasChildren']),
        entry('Hidden', 'Hidden', ['\\NOSELECT']),
      ],
    })

    const mailboxes = await listNaverMailboxes('a@naver.com', 'pw', () => client)

    assert.deepEqual(
      mailboxes.map((mailbox) => mailbox.name),
      ['INBOX'],
    )
  })

  it('LIST만 요청하고 메일함을 열거나 메일을 읽는 명령은 보내지 않는다', async () => {
    const { client, calls } = fakeListClient({})

    await listNaverMailboxes('a@naver.com', 'pw', () => client)

    assert.deepEqual(calls, ['connect', 'list:{"listOnly":true}', 'logout'])
  })

  it('로그인에 실패하면 분류된 오류를 던지고 연결을 닫는다', async () => {
    const { client, calls } = fakeListClient({
      connect: async () => {
        throw imapError({ authenticationFailed: true, serverResponseCode: 'AUTHENTICATIONFAILED' })
      },
    })

    await assert.rejects(
      listNaverMailboxes('a@naver.com', 'pw', () => client),
      (error: unknown) => error instanceof ApiError && error.code === 'MAIL_AUTH_REJECTED',
    )
    assert.deepEqual(calls, ['connect', 'close'])
  })

  it('목록 요청이 실패해도 로그아웃하고 원문 오류는 노출하지 않는다', async () => {
    const { client, calls } = fakeListClient({
      list: async () => {
        throw new Error(RAW_SERVER_TEXT)
      },
    })

    await assert.rejects(
      listNaverMailboxes('a@naver.com', 'pw', () => client),
      (error: unknown) =>
        error instanceof ApiError &&
        error.code === 'MAIL_MAILBOX_LIST_FAILED' &&
        !error.message.includes(RAW_SERVER_TEXT),
    )
    assert.ok(calls.includes('logout'))
  })

  it('메일함이 비정상적으로 많으면 거부한다', async () => {
    const { client } = fakeListClient({
      list: async () => Array.from({ length: 2001 }, (_, i) => entry(`F${i}`, `F${i}`)),
    })

    await assert.rejects(
      listNaverMailboxes('a@naver.com', 'pw', () => client),
      (error: unknown) => error instanceof ApiError && error.code === 'MAIL_MAILBOX_LIST_FAILED',
    )
  })
})
