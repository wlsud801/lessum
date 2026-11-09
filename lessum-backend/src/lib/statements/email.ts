import { createHash } from 'node:crypto'

import { simpleParser, type ParsedMail } from 'mailparser'

import { StatementFormatError } from './errors.js'
import { loadDocument } from './html.js'
import { parseHyundai } from './hyundai.js'
import { parseLotte } from './lotte.js'
import { LOGIN_URL } from './official-client.js'
import { parseShinhan } from './shinhan.js'
import type { StatementResult } from './statement.js'
import { decodeHtml } from './text.js'
import { decryptVestmail } from './vestmail.js'
import { parseWoori } from './woori.js'

export const PARSER_VERSION = 'ts-email-v3'
export const MAX_BYTES = 20 * 1024 * 1024

const PARSERS: Record<string, (text: string) => StatementResult> = {
  lotte: parseLotte,
  woori: parseWoori,
  hyundai: parseHyundai,
  shinhan: parseShinhan,
}

const sha256Hex = (data: Uint8Array | string) =>
  createHash('sha256').update(data).digest('hex')

export function parseAttachment(
  issuer: string,
  text: string,
  password?: string | null,
): StatementResult {
  const encrypted =
    text.includes('eval(atob(b_p))') && /s\[0\]\s*=/.test(text)

  let html = text
  if (encrypted) {
    if (!password) {
      return { status: 'password_required', transactions: [], references: [], warnings: [] }
    }
    html = decryptVestmail(text, password)
  }

  if (issuer === 'samsung') {
    const hasLoginForm = loadDocument(html)('form')
      .toArray()
      .some((form) => form.attribs.action === LOGIN_URL)
    if (!hasLoginForm) {
      throw new StatementFormatError('Unsupported Samsung statement format')
    }
    return {
      status: 'requires_online_statement',
      transactions: [],
      references: [],
      warnings: [
        'Decrypted attachment contains access information, not transactions. Use the Samsung online collection flow.',
      ],
    }
  }

  const parser = PARSERS[issuer]
  if (!parser) {
    throw new StatementFormatError('Unsupported issuer')
  }
  return parser(html)
}

export function attachSource(
  result: StatementResult,
  issuer: string,
  data: Uint8Array,
  raw: Uint8Array,
  sourceFormat: string,
): StatementResult {
  const contentHash = sha256Hex(raw)
  result.issuer = issuer
  result.parser_version = PARSER_VERSION
  result.source_format = sourceFormat
  result.source_sha256 = sha256Hex(data)
  result.attachment_sha256 = contentHash

  for (const row of result.transactions) {
    row.source_row_id = sha256Hex(`${issuer}:${contentHash}:${row.source_row}`)
  }
  return result
}

export async function parseMessage(data: Uint8Array): Promise<ParsedMail> {
  if (data.length > MAX_BYTES) {
    throw new StatementFormatError('Email exceeds 20 MiB limit')
  }
  return simpleParser(Buffer.from(data), {
    skipHtmlToText: true,
    skipImageLinks: true,
    skipTextToHtml: true,
    skipTextLinks: true,
  })
}

export function extractHtmlAttachment(
  message: ParsedMail,
  countError: string,
  sizeError: string,
): { raw: Buffer; text: string } {
  const attachments = message.attachments.filter(
    (attachment) =>
      attachment.filename && /\.html?$/i.test(attachment.filename),
  )
  if (attachments.length !== 1) {
    throw new StatementFormatError(countError)
  }

  const attachment = attachments[0]
  const raw = attachment.content
  if (!raw || raw.length > MAX_BYTES) {
    throw new StatementFormatError(sizeError)
  }

  const contentType = attachment.headers.get('content-type') as
    | { params?: { charset?: string } }
    | undefined
  return { raw, text: decodeHtml(raw, contentType?.params?.charset) }
}

export async function parseEmail(
  data: Uint8Array,
  issuer: string,
  password?: string | null,
): Promise<StatementResult> {
  const message = await parseMessage(data)
  const { raw, text } = extractHtmlAttachment(
    message,
    'Expected exactly one HTML statement attachment',
    'Invalid attachment size',
  )

  return attachSource(
    parseAttachment(issuer, text, password),
    issuer,
    data,
    raw,
    'email',
  )
}
