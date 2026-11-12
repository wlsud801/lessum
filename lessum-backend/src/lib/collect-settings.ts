import { findCardIssuer } from './card-issuers.js'
import { isValidDateString, nextCollectDate, type ArrivalDay } from './collect-schedule.js'
import { encryptSecret } from './crypto.js'
import { ApiError } from './errors.js'
import { decodeImapUtf7 } from './imap-utf7.js'

const MAX_MAILBOX_NAME_LENGTH = 512
const MAX_STATEMENT_PASSWORD_LENGTH = 128
const MAILBOX_NAME_PATTERN = /^[\x20-\x7e]+$/

export interface CardSettingInput {
  issuer: string
  arrivalDay: ArrivalDay
  statementPassword: string | null | undefined
}

export interface CollectSettingsInput {
  mailboxName: string
  mailboxImapName: string
  startDate: string
  cards: CardSettingInput[]
}

export interface ExistingCardRow {
  issuer: string
  statement_password_encrypted: string | null
  statement_password_one_time?: boolean
}

export const statementPasswordContext = (userId: string, issuer: string) =>
  `${userId}:statement-password:${issuer}`

const badRequest = (code: string, message: string) =>
  new ApiError(400, code, message)

function asRecord(value: unknown): Record<string, unknown> {
  return typeof value === 'object' && value !== null
    ? (value as Record<string, unknown>)
    : {}
}

function parseMailbox(value: unknown) {
  if (
    typeof value !== 'string' ||
    value.length > MAX_MAILBOX_NAME_LENGTH ||
    !MAILBOX_NAME_PATTERN.test(value)
  ) {
    throw badRequest('INVALID_MAILBOX', '수집할 메일함을 선택해주세요.')
  }

  try {
    return { mailboxImapName: value, mailboxName: decodeImapUtf7(value) }
  } catch {
    throw badRequest('INVALID_MAILBOX', '수집할 메일함을 선택해주세요.')
  }
}

function parseStartDate(value: unknown, today: string) {
  if (typeof value !== 'string' || !isValidDateString(value)) {
    throw badRequest('INVALID_START_DATE', '가져오기 시작일을 확인해주세요.')
  }
  if (value > today) {
    throw badRequest(
      'INVALID_START_DATE',
      '가져오기 시작일은 오늘보다 늦을 수 없습니다.',
    )
  }
  return value
}

function parseArrivalDay(value: unknown): ArrivalDay {
  if (value === 'last') {
    return 'last'
  }
  if (typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 31) {
    return value
  }
  throw badRequest(
    'INVALID_ARRIVAL_DAY',
    '명세서 도착 예정일은 1~31일 또는 말일로 선택해주세요.',
  )
}

function parseStatementPassword(value: unknown, needsPassword: boolean) {
  if (value === undefined || value === '') {
    return undefined
  }
  if (value === null) {
    return null
  }
  if (typeof value !== 'string' || value.length > MAX_STATEMENT_PASSWORD_LENGTH) {
    throw badRequest('INVALID_STATEMENT_PASSWORD', '명세서 암호를 확인해주세요.')
  }
  if (!needsPassword) {
    throw badRequest(
      'STATEMENT_PASSWORD_NOT_NEEDED',
      '이 카드는 명세서 암호가 필요하지 않습니다.',
    )
  }
  return value
}

function parseCard(value: unknown): CardSettingInput {
  const source = asRecord(value)
  const issuer = typeof source.issuer === 'string' ? findCardIssuer(source.issuer) : undefined

  if (!issuer) {
    throw badRequest('INVALID_ISSUER', '카드사를 확인해주세요.')
  }
  if (!issuer.supported) {
    throw badRequest('UNSUPPORTED_ISSUER', `${issuer.name}카드는 현재 지원하지 않습니다.`)
  }

  return {
    issuer: issuer.id,
    arrivalDay: parseArrivalDay(source.arrival_day),
    statementPassword: parseStatementPassword(
      source.statement_password,
      issuer.needsStatementPassword,
    ),
  }
}

export function parseCollectSettingsInput(
  body: unknown,
  today: string,
): CollectSettingsInput {
  const source = asRecord(body)

  if (!Array.isArray(source.cards) || source.cards.length === 0) {
    throw badRequest('INVALID_CARDS', '명세서를 가져올 카드사를 선택해주세요.')
  }
  const cards = source.cards.map(parseCard)
  if (new Set(cards.map((card) => card.issuer)).size !== cards.length) {
    throw badRequest('INVALID_CARDS', '같은 카드사가 중복되어 있습니다.')
  }

  return {
    ...parseMailbox(source.mailbox_imap_name),
    startDate: parseStartDate(source.start_date, today),
    cards,
  }
}

export function buildCardRows(
  userId: string,
  input: CollectSettingsInput,
  existing: ExistingCardRow[],
  today: string,
  key: Buffer,
) {
  const stored = new Map(existing.map((row) => [row.issuer, row]))

  return input.cards.map((card) => {
    let encrypted: string | null
    let oneTime = false
    if (card.statementPassword === undefined) {
      const kept = stored.get(card.issuer)
      encrypted = kept?.statement_password_encrypted ?? null
      oneTime = encrypted !== null && (kept?.statement_password_one_time ?? false)
    } else if (card.statementPassword === null) {
      encrypted = null
    } else {
      encrypted = encryptSecret(
        key,
        card.statementPassword,
        statementPasswordContext(userId, card.issuer),
      )
    }

    return {
      user_id: userId,
      issuer: card.issuer,
      enabled: true,
      arrival_day: card.arrivalDay === 'last' ? null : card.arrivalDay,
      arrival_is_month_end: card.arrivalDay === 'last',
      statement_password_encrypted: encrypted,
      statement_password_one_time: oneTime,
      next_collect_on: nextCollectDate(card.arrivalDay, today),
    }
  })
}

export interface StatementPasswordInput {
  issuer: string
  password: string
  keep: boolean
}

export function parseStatementPasswordInput(
  issuerId: unknown,
  body: unknown,
): StatementPasswordInput {
  const issuer =
    typeof issuerId === 'string' ? findCardIssuer(issuerId) : undefined
  if (!issuer || !issuer.supported) {
    throw badRequest('INVALID_ISSUER', '카드사를 확인해주세요.')
  }
  if (!issuer.needsStatementPassword) {
    throw badRequest(
      'STATEMENT_PASSWORD_NOT_NEEDED',
      '이 카드는 명세서 암호가 필요하지 않습니다.',
    )
  }

  const source = asRecord(body)
  const password = source.statement_password
  if (
    typeof password !== 'string' ||
    password.length === 0 ||
    password.length > MAX_STATEMENT_PASSWORD_LENGTH
  ) {
    throw badRequest('INVALID_STATEMENT_PASSWORD', '명세서 암호를 확인해주세요.')
  }

  return { issuer: issuer.id, password, keep: source.keep === true }
}
