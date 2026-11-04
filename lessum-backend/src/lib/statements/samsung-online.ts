import { createHash } from 'node:crypto'

import {
  MAX_BYTES,
  attachSource,
  extractHtmlAttachment,
  parseMessage,
} from './email.js'
import { StatementFormatError } from './errors.js'
import { loadDocument } from './html.js'
import {
  EXPORT_URL,
  LOGIN_URL,
  MAX_RESPONSE_BYTES,
  ORIGIN,
  PAGE,
  SUMMARY_URL,
  SamsungTransportError,
  createSamsungHttp,
  type SamsungHttp,
  type SamsungResponse,
} from './official-client.js'
import { SamsungExportError, integer } from './samsung-export.js'
import { parseSamsungXlsx, type SamsungReference } from './samsung.js'
import type { StatementResult } from './statement.js'
import { clean, decodeHtml, parseDate } from './text.js'
import { decryptVestmail } from './vestmail.js'
import { validateZip } from './zip.js'

export const SAMSUNG_SENDER = 'billing@samsungcard.com'

const ACCESS_KEYS = ['bilMngtNoEncr', 'bilMngtNoDvC', 'stlmDt'] as const
const UNHANDLED_PRODUCT_COUNTS = [
  'rvoFpyCnt',
  'rvoStmCdLnCnt',
  'stmCdLnCnt',
  'cdlnCnt',
  'istmFnnCnt',
  'crdPrtctnPdCnt',
  'ancsCnt',
]
const ZIP_SIGNATURE = Buffer.from([0x50, 0x4b, 0x03, 0x04])
const LOGIN_SUCCESS_PATTERN =
  /location\.href\s*=\s*['"]\/personal\/statement\/card\/UBLDRP0201P4\.jsp['"]/
const SCHEMA_CHANGED = 'Samsung official response schema changed'

export interface AccessFields {
  bilMngtNoEncr: string
  bilMngtNoDvC: string
  stlmDt: string
}

export interface OnlineDeps {
  http?: SamsungHttp
  now?: Date
}

export type OfficialReference = SamsungReference & {
  official_cancellation_count: number
}

type Json = Record<string, unknown>

function unquote(value: string): string {
  return value.replace(/(?:%[0-9a-fA-F]{2})+/g, (run) =>
    Buffer.from(run.replaceAll('%', ''), 'hex').toString('utf8'),
  )
}

function formEncode(fields: Record<string, string>): string {
  const encode = (value: string) =>
    encodeURIComponent(value)
      .replace(/[!'()*]/g, (char) => `%${char.charCodeAt(0).toString(16).toUpperCase()}`)
      .replaceAll('%20', '+')
  return Object.entries(fields)
    .map(([key, value]) => `${encode(key)}=${encode(value)}`)
    .join('&')
}

function asRecord(value: unknown): Json {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new StatementFormatError(SCHEMA_CHANGED)
  }
  return value as Json
}

function charsetOf(response: SamsungResponse): string | null {
  return /charset=([^;\s]+)/i.exec(response.headers.get('content-type') ?? '')?.[1] ?? null
}

function assertOk(response: SamsungResponse, label: string) {
  if (response.status >= 300) {
    throw new StatementFormatError(`${label} returned HTTP ${response.status}`)
  }
}

export function sourceAccess(html: string): AccessFields {
  const $ = loadDocument(html)
  const inputs = $('input').toArray()
  const found: Partial<AccessFields> = {}

  for (const key of ACCESS_KEYS) {
    const matches = inputs.filter((input) => input.attribs.id === key)
    const value = matches.length === 1 ? matches[0].attribs.value : undefined
    if (value) {
      found[key] = unquote(value)
    }
  }

  let fields = found as AccessFields
  if (Object.keys(found).length !== 3) {
    const sessions = inputs.filter((input) => input.attribs.id === 'sessionStr')
    const parts = sessions.length === 1 ? (sessions[0].attribs.value ?? '').split(',') : []
    if (parts.length !== 4 || ![1, 2, 3].every((index) => parts[index])) {
      throw new SamsungExportError('Statement access fields missing')
    }
    fields = {
      bilMngtNoEncr: unquote(parts[1]),
      bilMngtNoDvC: parts[2],
      stlmDt: parts[3],
    }
  }

  if (fields.bilMngtNoDvC !== '01' || !/^\d{8}$/.test(fields.stlmDt)) {
    throw new SamsungExportError('Only the verified personal-credit export is supported')
  }
  if (fields.bilMngtNoEncr.length > 512) {
    throw new SamsungExportError('Unexpected access field size')
  }
  return fields
}

export function requestPayload(fields: AccessFields, now: Date = new Date()): Json {
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000)
  const pad = (value: number, width = 2) => String(value).padStart(width, '0')
  const clock =
    pad(kst.getUTCHours()) +
    pad(kst.getUTCMinutes()) +
    pad(kst.getUTCSeconds()) +
    pad(kst.getUTCMilliseconds(), 3)

  return {
    batHistSeqn: 0,
    bilMngtNo: 0,
    ...fields,
    common: {
      dlngEvnDvC: 'S',
      scrnId: 'UBLDRP0201M0',
      stdEtxtCrtDt: `${kst.getUTCFullYear()}${pad(kst.getUTCMonth() + 1)}${pad(kst.getUTCDate())}`,
      stdEtxtCrtSysNm: 'P0000023',
      stdEtxtSn: `${clock}00001`,
      stdEtxtPrgDvNo: 0,
      stdEtxtPrgNo: 0,
      indvInfIncYn: 'N',
      usid: ' ',
    },
  }
}

export async function downloadExport(
  landing: string,
  http: SamsungHttp,
  now?: Date,
): Promise<Buffer> {
  const payload = requestPayload(sourceAccess(landing), now)

  let response: SamsungResponse
  try {
    response = await http.send({
      method: 'POST',
      url: EXPORT_URL,
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Origin: ORIGIN,
        Referer: PAGE,
      },
      body: formEncode({
        payload: JSON.stringify(payload),
        serviceId: 'SBLDRP0201S41',
        extention: '',
        separator: '',
        charset: '',
      }),
      maxBytes: MAX_BYTES,
    })
  } catch (error) {
    if (error instanceof SamsungTransportError) {
      throw new SamsungExportError('Official export connection failed')
    }
    throw error
  }

  if (response.status >= 300) {
    throw new SamsungExportError(`Official export returned HTTP ${response.status}`)
  }
  if (response.body.length > MAX_BYTES) {
    throw new SamsungExportError('Export exceeds 20 MiB limit')
  }
  if (!response.body.subarray(0, 4).equals(ZIP_SIGNATURE)) {
    throw new SamsungExportError('Server did not return XLSX; access may require renewal')
  }
  validateZip(response.body)
  return response.body
}

export async function samsungEmailAttachment(data: Uint8Array) {
  const message = await parseMessage(data)
  const senders = message.from?.value ?? []
  if (senders.length !== 1 || senders[0].address?.toLowerCase() !== SAMSUNG_SENDER) {
    throw new StatementFormatError(
      'Email sender does not match selected Samsung statement sender',
    )
  }

  const { raw, text } = extractHtmlAttachment(
    message,
    'Expected one Samsung statement HTML attachment',
    'Invalid Samsung attachment',
  )
  return { subject: message.subject ?? '', raw, html: text }
}

function authorizationFields(unlocked: string): Record<string, string> {
  const $ = loadDocument(unlocked)
  const forms = $('form').toArray()
  if (
    forms.length !== 1 ||
    forms[0].attribs.action !== LOGIN_URL ||
    (forms[0].attribs.method ?? '').toUpperCase() !== 'POST'
  ) {
    throw new StatementFormatError('Unrecognized Samsung email authorization form')
  }

  const inputs = $('form input[name]').toArray()
  const fields = Object.fromEntries(
    inputs.map((input) => [input.attribs.name, input.attribs.value ?? '']),
  )
  if (
    inputs.length !== 2 ||
    Object.keys(fields).sort().join(',') !== '_command,pvalue' ||
    fields._command !== 'login' ||
    !fields.pvalue ||
    fields.pvalue.length > 16384
  ) {
    throw new StatementFormatError('Unrecognized Samsung email authorization fields')
  }
  return fields
}

export async function authorize(
  html: string,
  password: string,
  http: SamsungHttp,
): Promise<string> {
  const fields = authorizationFields(decryptVestmail(html, password))

  const login = await http.send({
    method: 'POST',
    url: LOGIN_URL,
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: formEncode(fields),
  })
  assertOk(login, 'Samsung official request')
  if (login.body.length > MAX_RESPONSE_BYTES) {
    throw new StatementFormatError('Official statement response exceeds size limit')
  }
  if (!LOGIN_SUCCESS_PATTERN.test(login.body.toString('latin1'))) {
    throw new StatementFormatError(
      'Email access information was not accepted; renewal may be required',
    )
  }

  const page = await http.send({
    method: 'GET',
    url: PAGE,
    headers: { Referer: LOGIN_URL },
  })
  assertOk(page, 'Samsung official request')
  if (page.body.length > MAX_RESPONSE_BYTES) {
    throw new StatementFormatError('Official statement response exceeds size limit')
  }

  const landing = decodeHtml(page.body, charsetOf(page))
  sourceAccess(landing)
  return landing
}

export function controlReference(raw: unknown, access: AccessFields): OfficialReference {
  const data = asRecord(raw)
  const procsResult = asRecord(data.common ?? {}).procsRsDvC
  if (procsResult !== 0 && procsResult !== '0') {
    throw new StatementFormatError('Official statement summary request failed')
  }

  const base = asRecord(data.bDBDTBBLD001DVO)
  if (base.stlmDt !== access.stlmDt) {
    throw new StatementFormatError('Official summary date does not match the email entry')
  }
  if (base.bilMngtNoDvC !== '01') {
    throw new StatementFormatError('Unsupported statement type')
  }
  if (
    UNHANDLED_PRODUCT_COUNTS.some((key) => integer(data[key], true)) ||
    (Array.isArray(data.adtCsbList) ? data.adtCsbList.length > 0 : Boolean(data.adtCsbList))
  ) {
    throw new StatementFormatError('Additional financial products require dedicated validation')
  }

  const paymentDate = access.stlmDt
  const iso = `${paymentDate.slice(0, 4)}-${paymentDate.slice(4, 6)}-${paymentDate.slice(6, 8)}`
  const context = { payment_date: iso, statement_month: iso.slice(0, 7) }
  const counts = {
    D0: integer(data.procsFpyCnt, true) as number,
    D1: integer(data.procsIstmCnt, true) as number,
    DE: integer(data.procsFrnUDtlCt, true) as number,
  }
  if (Object.values(counts).some((count) => count < 0)) {
    throw new StatementFormatError('Invalid official statement counts')
  }

  const transactions: OfficialReference['transactions'] = []
  for (const listName of ['fpyList', 'istmList']) {
    const list = data[listName] ?? []
    if (!Array.isArray(list)) {
      throw new StatementFormatError(SCHEMA_CHANGED)
    }
    for (const entry of list) {
      const row = asRecord(entry)
      if (row.cptSlYn === 'Y') {
        continue
      }
      if (row.cptSlYn !== 'N') {
        throw new StatementFormatError('Unverified combined-purchase representation')
      }
      transactions.push({
        transaction_date: parseDate(clean(String(row.slDt ?? '')), context).date,
        merchant: clean(String(row.mrcNm ?? '')),
        original_amount: integer(row.slAm, true),
        billed_amount_krw: ['bilPcam', 'bilInt', 'bilFe'].reduce(
          (sum, key) => sum + (integer(row[key], true) as number),
          0,
        ),
      })
    }
  }
  if (counts.D0 + counts.D1 > 0 && transactions.length === 0) {
    throw new StatementFormatError('Official summary contains no comparison transactions')
  }

  const summary = {
    일시불: integer(base.fpyUseAm, true) as number,
    할부: integer(base.istmUseAm, true) as number,
    미리입금하신금액: integer(base.prdptAm, true) as number,
  }
  const grandTotal = integer(base.totBilAm, true) as number
  if (Object.values(summary).reduce((sum, value) => sum + value, 0) !== grandTotal) {
    throw new StatementFormatError('Unmapped summary adjustments; manual review required')
  }

  return {
    context,
    transactions,
    validation: {
      sections: Object.fromEntries(
        Object.entries(counts).map(([code, count]) => [code, { declared_count: count }]),
      ),
      declared_summary_krw: summary,
      declared_grand_total_krw: grandTotal,
    },
    official_cancellation_count: integer(data.procsStlmCanIzCt, true) as number,
  }
}

export async function fetchReference(
  landing: string,
  http: SamsungHttp,
  now?: Date,
): Promise<OfficialReference> {
  const access = sourceAccess(landing)
  const payload = {
    ...requestPayload(access, now),
    stlmDtEnc: '',
    cstMngtNoe: '',
    crtlPgeNo: 1,
    expsrListEcn: 10,
    inqrRnk: 1,
    exrCndtCn1: '',
    exrCndtCn2: '',
    exrCndtCn3: '',
  }

  const response = await http.send({
    method: 'POST',
    url: SUMMARY_URL,
    headers: {
      'Content-Type': 'application/json; charset=UTF-8',
      Origin: ORIGIN,
      Referer: PAGE,
    },
    body: JSON.stringify(payload),
  })
  assertOk(response, 'Samsung official request')
  if (response.body.length > MAX_RESPONSE_BYTES) {
    throw new StatementFormatError('Official statement response exceeds size limit')
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(response.body.toString('utf8'))
  } catch {
    throw new StatementFormatError(SCHEMA_CHANGED)
  }
  return controlReference(parsed, access)
}

function assertSubjectDate(subject: string, paymentDate: string) {
  const match = /(20\d{2})년\s*(\d{1,2})월\s*(\d{1,2})일/.exec(subject)
  if (!match) {
    return
  }
  const iso = `${match[1]}-${match[2].padStart(2, '0')}-${match[3].padStart(2, '0')}`
  if (iso !== paymentDate) {
    throw new StatementFormatError('Email subject and official statement dates differ')
  }
}

export async function collectSamsungEmail(
  data: Uint8Array,
  statementPassword: string | null | undefined,
  { http = createSamsungHttp(), now }: OnlineDeps = {},
): Promise<StatementResult> {
  const { subject, raw, html } = await samsungEmailAttachment(data)
  if (!statementPassword) {
    return attachSource(
      { status: 'password_required', transactions: [], references: [], warnings: [] },
      'samsung',
      data,
      raw,
      'email',
    )
  }

  try {
    const landing = await authorize(html, statementPassword, http)
    const reference = await fetchReference(landing, http, now)
    assertSubjectDate(subject, reference.context.payment_date as string)

    const workbook = await downloadExport(landing, http, now)
    const result = await parseSamsungXlsx(workbook, reference)

    const validation = result.validation as {
      complete: boolean
      cancellation_reference_count: number
      cancellation_count_matches?: boolean
    }
    validation.cancellation_count_matches =
      validation.cancellation_reference_count === reference.official_cancellation_count
    if (!validation.cancellation_count_matches) {
      validation.complete = false
      result.status = 'needs_review'
    }

    attachSource(result, 'samsung', data, raw, 'email_to_official_export')
    result.collection = {
      method: 'email_attachment_to_official_export',
      email_attachment_only_verified: true,
      saved_html_used: false,
      imap_verified: false,
      workbook_sha256: createHash('sha256').update(workbook).digest('hex'),
    }
    return result
  } catch (error) {
    if (error instanceof SamsungTransportError) {
      throw new StatementFormatError(
        'Samsung official connection or file operation failed',
      )
    }
    throw error
  }
}
