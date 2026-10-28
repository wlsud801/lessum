import { ImapFlow } from 'imapflow'

import { ApiError } from './errors.js'

export const NAVER_IMAP_HOST = 'imap.naver.com'
export const NAVER_IMAP_PORT = 993
export const MAX_APP_PASSWORD_LENGTH = 128

const NAVER_EMAIL_PATTERN = /^[A-Za-z0-9._+-]+@naver\.com$/i
const KNOWN_RESPONSE_CODES = [
  'AUTHENTICATIONFAILED',
  'AUTHORIZATIONFAILED',
  'UNAVAILABLE',
  'PRIVACYREQUIRED',
  'EXPIRED',
]
const CONNECTION_CLOSED_CODES = [
  'NoConnection',
  'EConnectionClosed',
  'ClosedAfterConnectText',
  'ClosedAfterConnectTLS',
]

export interface ImapLoginClient {
  connect(): Promise<void>
  logout(): Promise<void>
  close(): void
  on(event: 'error', listener: (error: unknown) => void): unknown
}

export type ImapClientFactory = (
  email: string,
  appPassword: string,
) => ImapLoginClient

interface ImapErrorLike {
  code?: string
  authenticationFailed?: boolean
  serverResponseCode?: string
  responseText?: string
}

export function isNaverEmail(value: string): boolean {
  return NAVER_EMAIL_PATTERN.test(value)
}

const createImapClient: ImapClientFactory = (email, appPassword) =>
  new ImapFlow({
    host: NAVER_IMAP_HOST,
    port: NAVER_IMAP_PORT,
    secure: true,
    auth: { user: email, pass: appPassword },
    logger: false,
    connectionTimeout: 25_000,
    greetingTimeout: 15_000,
    socketTimeout: 30_000,
  })

function classifyAuthFailure(error: ImapErrorLike): ApiError {
  const response = `${error.responseText ?? ''} ${
    error.serverResponseCode ?? ''
  }`.toLowerCase()

  if (
    ['too many login', 'too many authentication', 'rate limit'].some((value) =>
      response.includes(value),
    )
  ) {
    return new ApiError(
      429,
      'MAIL_LOGIN_RATE_LIMITED',
      '서버가 로그인 시도 횟수 제한을 알렸습니다. 반복 시도하지 말고 잠시 후 확인해주세요.',
    )
  }
  if (
    ['imap access is disabled', 'imap is disabled'].some((value) =>
      response.includes(value),
    )
  ) {
    return new ApiError(
      422,
      'MAIL_IMAP_DISABLED',
      '네이버 메일에서 IMAP 사용이 꺼져 있습니다. 환경설정에서 IMAP/SMTP 사용을 ‘사용함’으로 바꿔주세요.',
    )
  }
  if (
    ['incorrect id or password', 'invalid credentials'].some((value) =>
      response.includes(value),
    )
  ) {
    return new ApiError(
      422,
      'MAIL_INVALID_CREDENTIALS',
      '서버가 계정 또는 비밀번호 불일치로 응답했습니다. 이메일과 앱 비밀번호를 확인해주세요.',
    )
  }

  const knownCode = KNOWN_RESPONSE_CODES.find(
    (code) => error.serverResponseCode?.toUpperCase() === code,
  )
  if (knownCode) {
    return new ApiError(
      422,
      'MAIL_AUTH_REJECTED',
      `서버 응답 코드: ${knownCode}. 이 코드만으로 비밀번호 오류 여부를 확정할 수 없습니다.`,
    )
  }
  return new ApiError(
    422,
    'MAIL_AUTH_REJECTED',
    '서버가 상세 원인을 구분할 수 없는 거부 응답을 보냈습니다. 비밀번호 오류로 확정할 수 없습니다.',
  )
}

export function classifyLoginError(error: unknown): ApiError {
  const imapError = (
    typeof error === 'object' && error !== null ? error : {}
  ) as ImapErrorLike

  if (imapError.authenticationFailed) {
    return classifyAuthFailure(imapError)
  }
  if (imapError.code === 'ETHROTTLE') {
    return new ApiError(
      429,
      'MAIL_LOGIN_RATE_LIMITED',
      '서버가 요청 횟수 제한을 알렸습니다. 잠시 후 다시 시도해주세요.',
    )
  }
  if (imapError.code && CONNECTION_CLOSED_CODES.includes(imapError.code)) {
    return new ApiError(
      502,
      'MAIL_CONNECTION_CLOSED',
      '네이버 IMAP 연결이 종료되었습니다. 인증 거부나 비밀번호 오류로 확정할 수 없습니다. 잠시 후 다시 시도해주세요.',
    )
  }
  return new ApiError(
    502,
    'MAIL_CONNECTION_FAILED',
    '네이버 보안 연결에 실패했습니다. 잠시 후 다시 시도해주세요.',
  )
}

export async function verifyNaverLogin(
  email: string,
  appPassword: string,
  createClient: ImapClientFactory = createImapClient,
): Promise<void> {
  const client = createClient(email, appPassword)
  client.on('error', () => undefined)

  try {
    await client.connect()
  } catch (error) {
    client.close()
    throw classifyLoginError(error)
  }

  try {
    await client.logout()
  } catch {
    client.close()
  }
}
