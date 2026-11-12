import { createHash } from 'node:crypto'

import type { Cheerio } from 'cheerio'
import type { Element } from 'domhandler'

import { attachSource, parseMessage } from './email.js'
import { StatementFormatError } from './errors.js'
import { loadDocument, type CheerioAPI } from './html.js'
import {
  finish,
  record,
  type CardStatementResult,
  type StatementContext,
  type StatementResult,
  type TransactionRecord,
} from './statement.js'
import { amount, clean } from './text.js'

export const LOTTE_ORIGIN = 'https://www.lottecard.co.kr'
export const LOTTE_ENTRY_PATH = '/app/LPMCDBA_V000.lc'
export const LOTTE_VERIFY_PATH = '/app/LPMCDBA_P000.lc'
export const LOTTE_CERT_PATH = '/app/LPCMNNA_A100.lc'
export const LOTTE_STATEMENT_PATH = '/app/LPMCDBA_V100.lc'
export const LOTTE_ACCOUNT_PATH = '/app/LPMCDBA_A101.lc'
export const LOTTE_DETAIL_PATH = '/app/LPMCDBA_A102.lc'

const ALLOWED_HOST = 'www.lottecard.co.kr'
const TRACKING_HOST = 'lcpush.lottecard.co.kr'
const LINK_TEXT = '명세서 확인하기'
const MAX_RESPONSE_BYTES = 5 * 1024 * 1024
const DEFAULT_TIMEOUT_MS = 30_000
const BIRTH_PATTERN = /^\d{6}$/
const BILL_MONTH_PATTERN = /billMonthList\s*=\s*JSON\.parse\('((?:[^'\\]|\\.)*)'\)/
const SUBJECT_DATE_PATTERN = /(20\d{2})년\s*(\d{1,2})월\s*(\d{1,2})일/
const SCHEMA_CHANGED = 'Lotte official response schema changed'
const USER_AGENT =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36'

export class LotteTransportError extends Error {
  constructor() {
    super('Lotte official connection failed')
    this.name = 'LotteTransportError'
  }
}

export class LotteAuthError extends StatementFormatError {
  constructor() {
    super('Lotte birth date verification was rejected')
    this.name = 'LotteAuthError'
  }
}

export interface LotteRequest {
  method: 'GET' | 'POST'
  url: string
  form?: Record<string, string>
  ajax?: boolean
  referer?: string
}

export interface LotteResponse {
  status: number
  body: string
}

export interface LotteHttp {
  send(request: LotteRequest): Promise<LotteResponse>
}

export interface LotteOnlineDeps {
  lotteHttp?: LotteHttp
}

interface BillMonth {
  bilDt: string
  accnoDc: string
  mbrno: string
  totBilAm: string
}

interface AjaxResult {
  Status: { code: number; message?: string }
  Content?: string
  inCno?: string
}

function assertOfficialUrl(url: URL) {
  if (
    url.protocol !== 'https:' ||
    url.hostname !== ALLOWED_HOST ||
    (url.port !== '' && url.port !== '443') ||
    url.username !== '' ||
    url.password !== ''
  ) {
    throw new StatementFormatError('Lotte statement link points outside the official site')
  }
}

function storeCookies(jar: Map<string, string>, headers: Headers) {
  for (const header of headers.getSetCookie()) {
    const [pair] = header.split(';')
    const separator = pair.indexOf('=')
    if (separator <= 0) {
      continue
    }
    jar.set(pair.slice(0, separator).trim(), pair.slice(separator + 1).trim())
  }
}

export function createLotteHttp(
  fetchImpl: typeof fetch = fetch,
  timeoutMs = DEFAULT_TIMEOUT_MS,
): LotteHttp {
  const cookies = new Map<string, string>()

  return {
    async send(request) {
      const url = new URL(request.url, LOTTE_ORIGIN)
      assertOfficialUrl(url)

      const headers: Record<string, string> = { 'User-Agent': USER_AGENT }
      if (request.referer) {
        headers.Referer = request.referer
      }
      if (request.ajax) {
        headers['X-Requested-With'] = 'XMLHttpRequest'
        headers.Accept = 'application/json, text/javascript, */*; q=0.01'
        headers.Origin = LOTTE_ORIGIN
      }
      if (request.form) {
        headers['Content-Type'] = 'application/x-www-form-urlencoded; charset=UTF-8'
      }
      const cookieHeader = [...cookies]
        .map(([name, value]) => `${name}=${value}`)
        .join('; ')
      if (cookieHeader) {
        headers.Cookie = cookieHeader
      }

      let response: Response
      let body: string
      try {
        response = await fetchImpl(url, {
          method: request.method,
          headers,
          body: request.form ? new URLSearchParams(request.form).toString() : undefined,
          redirect: 'manual',
          signal: AbortSignal.timeout(timeoutMs),
        })
        storeCookies(cookies, response.headers)
        body = await response.text()
      } catch {
        throw new LotteTransportError()
      }
      if (body.length > MAX_RESPONSE_BYTES) {
        throw new StatementFormatError('Lotte official response exceeds size limit')
      }
      return { status: response.status, body }
    },
  }
}

export function statementEntryUrl(html: string): string {
  const $ = loadDocument(html)
  const links = $('a')
    .toArray()
    .filter((anchor) => clean($(anchor).text()) === LINK_TEXT)
    .map((anchor) => anchor.attribs.href ?? '')
  const unique = [...new Set(links)]
  if (unique.length !== 1) {
    throw new StatementFormatError('Expected one Lotte statement link')
  }

  let tracking: URL
  try {
    tracking = new URL(unique[0])
  } catch {
    throw new StatementFormatError('Invalid Lotte statement link')
  }

  let target = tracking.href
  if (tracking.hostname === TRACKING_HOST) {
    const destination = tracking.searchParams.get('URL')
    if (!destination) {
      throw new StatementFormatError('Lotte tracking link has no destination')
    }
    target = destination.replaceAll('*', '&')
  }

  let entry: URL
  try {
    entry = new URL(target)
  } catch {
    throw new StatementFormatError('Invalid Lotte statement link')
  }
  assertOfficialUrl(entry)
  if (entry.pathname !== LOTTE_ENTRY_PATH || !entry.searchParams.get('p')) {
    throw new StatementFormatError('Unrecognized Lotte statement link')
  }
  return entry.href
}

export function subjectPaymentDate(subject: string): string {
  const match = SUBJECT_DATE_PATTERN.exec(subject)
  if (!match) {
    throw new StatementFormatError('Lotte statement payment date unavailable')
  }
  return `${match[1]}${match[2].padStart(2, '0')}${match[3].padStart(2, '0')}`
}

function assertOk(response: LotteResponse, label: string) {
  if (response.status !== 200) {
    throw new StatementFormatError(`${label} returned HTTP ${response.status}`)
  }
}

function ajaxResult(response: LotteResponse, label: string): AjaxResult {
  assertOk(response, label)
  let parsed: unknown
  try {
    parsed = JSON.parse(response.body)
  } catch {
    throw new StatementFormatError(SCHEMA_CHANGED)
  }
  const status = (parsed as { Status?: { code?: unknown } } | null)?.Status
  if (typeof status?.code !== 'number') {
    throw new StatementFormatError(SCHEMA_CHANGED)
  }
  return parsed as AjaxResult
}

function requireSuccess(result: AjaxResult, label: string) {
  if (result.Status.code !== 0) {
    throw new StatementFormatError(`${label} was rejected by Lotte`)
  }
}

export function billMonths(html: string): BillMonth[] {
  const match = BILL_MONTH_PATTERN.exec(html)
  if (!match) {
    throw new StatementFormatError('Lotte statement month list unavailable')
  }

  let parsed: unknown
  try {
    parsed = JSON.parse(JSON.parse(`"${match[1].replaceAll('"', '\\"')}"`))
  } catch {
    throw new StatementFormatError(SCHEMA_CHANGED)
  }
  if (!Array.isArray(parsed)) {
    throw new StatementFormatError(SCHEMA_CHANGED)
  }
  return parsed.map((entry) => {
    const item = entry as Record<string, unknown>
    if (
      typeof item.bilDt !== 'string' ||
      typeof item.accnoDc !== 'string' ||
      typeof item.mbrno !== 'string' ||
      typeof item.totBilAm !== 'string'
    ) {
      throw new StatementFormatError(SCHEMA_CHANGED)
    }
    return {
      bilDt: item.bilDt,
      accnoDc: item.accnoDc,
      mbrno: item.mbrno,
      totBilAm: item.totBilAm,
    }
  })
}

export function selectBillMonth(months: BillMonth[], paymentDate: string): BillMonth {
  const matches = months.filter(
    (month) => month.bilDt === paymentDate && month.accnoDc === '01',
  )
  if (matches.length !== 1) {
    throw new StatementFormatError('Lotte statement for the email payment date not found')
  }
  return matches[0]
}

export function accountFields($: CheerioAPI): { bllUnitNo: string; lotteAmexDc: string } {
  const units = $('input[name="unit"]').toArray()
  const amex = $('input[name="amex"]').toArray()
  if (units.length !== 1 || amex.length !== 1) {
    throw new StatementFormatError('Multiple Lotte billing accounts require dedicated validation')
  }
  return {
    bllUnitNo: units[0].attribs.value ?? '',
    lotteAmexDc: amex[0].attribs.value ?? '',
  }
}

function specValue(item: Cheerio<Element>, id: string): string {
  const spans = item.find(`.useList .infoDataS span#${id}`)
  if (spans.length !== 1) {
    throw new StatementFormatError('Lotte transaction detail fields changed')
  }
  return clean(spans.text())
}

function installmentTerms(value: string): { round: number; months: number } | null {
  if (value === '-' || value === '') {
    return null
  }
  const match = /^(\d+)\s*\/\s*(\d+)$/.exec(value)
  if (!match) {
    throw new StatementFormatError('Unknown installment notation')
  }
  return { round: Number(match[1]), months: Number(match[2]) }
}

export function parseLotteDetail(
  html: string,
  context: StatementContext,
  declaredTotal: number,
): CardStatementResult {
  const $ = loadDocument(html)
  const lists = $('ul.useCardList')
  if (lists.length !== 1) {
    throw new StatementFormatError('Lotte transaction list unavailable')
  }

  const countMatch = /총\s*([\d,]+)\s*건/.exec(clean($('.totArea').text()))
  if (!countMatch) {
    throw new StatementFormatError('Lotte transaction count unavailable')
  }
  const declaredCount = Number(countMatch[1].replaceAll(',', ''))

  const rows: TransactionRecord[] = []
  let fees = 0
  lists
    .children('li')
    .toArray()
    .forEach((element, index) => {
      const item = $(element)
      const merchant = clean(item.children('strong').text())
      const info = item
        .children('.info')
        .children('span')
        .toArray()
        .map((span) => clean($(span).text()))
      if (!merchant || info.length !== 4) {
        throw new StatementFormatError('Lotte transaction columns changed')
      }

      const [rawDate, plan, , cardLabel] = info
      const terms = installmentTerms(specValue(item, 'specintmt'))
      const planMatch = /^할부\((\d+)\/(\d+)\)$/.exec(plan)
      if (plan === '일시불') {
        if (terms) {
          throw new StatementFormatError('Lotte payment plan does not match installment terms')
        }
      } else if (
        !planMatch ||
        !terms ||
        Number(planMatch[1]) !== terms.round ||
        Number(planMatch[2]) !== terms.months
      ) {
        throw new StatementFormatError('Unknown Lotte payment plan')
      }

      const principal = amount(specValue(item, 'specbilprn'))
      const fee = amount(specValue(item, 'specbilfe'))
      const billed = amount(item.children('em').text())
      const total = amount(specValue(item, 'specslam'))
      if (principal === null || billed === null || principal + (fee ?? 0) !== billed) {
        throw new StatementFormatError('Lotte billed amount components do not match')
      }

      rows.push(
        record(
          'lotte',
          `online:${index}`,
          rawDate,
          merchant,
          total ?? (terms ? null : principal),
          principal,
          context,
          {
            fee_krw: fee,
            card_label: cardLabel,
            billed_amount_krw: billed,
            installment_round: terms?.round ?? null,
            installment_months: terms?.months ?? null,
          },
        ),
      )
      fees += fee ?? 0
    })

  const result = finish(context, rows, declaredTotal - fees, fees, 0, fees)
  result.validation.purchase_row_count = rows.length
  result.validation.declared_purchase_count = declaredCount
  result.validation.purchase_count_matches = rows.length === declaredCount
  if (!result.validation.purchase_count_matches) {
    result.status = 'needs_review'
  }
  return result
}

async function fetchDetail(
  entryUrl: string,
  birth: string,
  paymentDate: string,
  http: LotteHttp,
): Promise<{ detail: string; month: BillMonth }> {
  const entry = await http.send({ method: 'GET', url: entryUrl })
  assertOk(entry, 'Lotte statement entry')
  if (!loadDocument(entry.body)('input[name="birth"]').length) {
    throw new StatementFormatError('Lotte statement link expired or changed')
  }

  const verify = ajaxResult(
    await http.send({
      method: 'POST',
      url: LOTTE_VERIFY_PATH,
      form: { monitorYn: '', birth },
      ajax: true,
      referer: entryUrl,
    }),
    'Lotte verification',
  )
  if (verify.Status.code !== 0) {
    throw new LotteAuthError()
  }
  if (typeof verify.inCno !== 'string' || !verify.inCno) {
    throw new StatementFormatError(SCHEMA_CHANGED)
  }

  requireSuccess(
    ajaxResult(
      await http.send({
        method: 'POST',
        url: LOTTE_CERT_PATH,
        form: {
          inflPhc: '01',
          pgmId: 'LPMCDBA_V100.lc',
          enCno: verify.inCno,
          cert: 'dbd6',
        },
        ajax: true,
        referer: entryUrl,
      }),
      'Lotte certification',
    ),
    'Lotte certification',
  )

  const statementUrl = `${LOTTE_ORIGIN}${LOTTE_STATEMENT_PATH}`
  const page = await http.send({ method: 'GET', url: statementUrl, referer: entryUrl })
  assertOk(page, 'Lotte statement page')
  const month = selectBillMonth(billMonths(page.body), paymentDate)

  const base = {
    expsFdC: 'MU01',
    responseType: 'TEXT',
    mbrno: month.mbrno,
    bilDt: month.bilDt,
    accnoDc: month.accnoDc,
    lotteAmexDc: '',
    bllUnitNo: '',
    slocDc: '',
    slPdC: '',
    cdno: '',
    searchType: '',
    checkPlusFiter: '',
    cdDc: '',
  }
  const account = ajaxResult(
    await http.send({
      method: 'POST',
      url: LOTTE_ACCOUNT_PATH,
      form: base,
      ajax: true,
      referer: statementUrl,
    }),
    'Lotte account lookup',
  )
  requireSuccess(account, 'Lotte account lookup')

  const detail = ajaxResult(
    await http.send({
      method: 'POST',
      url: LOTTE_DETAIL_PATH,
      form: {
        ...base,
        ...accountFields(loadDocument(account.Content ?? '')),
        slocDc: '0',
        slPdC: '0',
        checkPlusFiter: '0',
        cdDc: '0',
      },
      ajax: true,
      referer: statementUrl,
    }),
    'Lotte statement detail',
  )
  requireSuccess(detail, 'Lotte statement detail')
  if (typeof detail.Content !== 'string') {
    throw new StatementFormatError(SCHEMA_CHANGED)
  }
  return { detail: detail.Content, month }
}

function canonicalSource(paymentDate: string, rows: TransactionRecord[]): Buffer {
  const lines = rows.map((row) =>
    [
      row.transaction_date,
      row.merchant,
      row.amount_krw,
      row.billed_principal_krw,
      row.fee_krw,
      row.installment_round,
      row.installment_months,
    ].join('\t'),
  )
  return Buffer.from(['lotte-online', paymentDate, ...lines].join('\n'))
}

export async function hasLotteStatementLink(data: Uint8Array): Promise<boolean> {
  const message = await parseMessage(data)
  const hasHtmlAttachment = message.attachments.some(
    (attachment) => attachment.filename && /\.html?$/i.test(attachment.filename),
  )
  if (hasHtmlAttachment || typeof message.html !== 'string') {
    return false
  }
  try {
    statementEntryUrl(message.html)
    return true
  } catch {
    return false
  }
}

export async function collectLotteEmail(
  data: Uint8Array,
  birth: string | null | undefined,
  { lotteHttp: http = createLotteHttp() }: LotteOnlineDeps = {},
): Promise<StatementResult> {
  const message = await parseMessage(data)
  if (typeof message.html !== 'string') {
    throw new StatementFormatError('Lotte statement email has no HTML body')
  }
  const entryUrl = statementEntryUrl(message.html)
  const paymentDate = subjectPaymentDate(message.subject ?? '')
  const body = Buffer.from(message.html)

  if (!birth || !BIRTH_PATTERN.test(birth)) {
    return attachSource(
      { status: 'password_required', transactions: [], references: [], warnings: [] },
      'lotte',
      data,
      body,
      'email_link',
    )
  }

  try {
    const { detail, month } = await fetchDetail(entryUrl, birth, paymentDate, http)
    const iso = `${paymentDate.slice(0, 4)}-${paymentDate.slice(4, 6)}-${paymentDate.slice(6, 8)}`
    const declaredTotal = amount(month.totBilAm)
    if (declaredTotal === null) {
      throw new StatementFormatError(SCHEMA_CHANGED)
    }

    const result = parseLotteDetail(
      detail,
      { payment_date: iso, statement_month: iso.slice(0, 7) },
      declaredTotal,
    )
    attachSource(
      result,
      'lotte',
      data,
      canonicalSource(paymentDate, result.transactions),
      'email_link_to_official_web',
    )
    result.collection = {
      method: 'email_link_to_official_web',
      detail_sha256: createHash('sha256').update(detail).digest('hex'),
    }
    return result
  } catch (error) {
    if (error instanceof LotteAuthError) {
      return attachSource(
        {
          status: 'password_required',
          transactions: [],
          references: [],
          warnings: ['Lotte birth date verification was rejected'],
          credential_rejected: true,
        },
        'lotte',
        data,
        body,
        'email_link',
      )
    }
    if (error instanceof LotteTransportError) {
      throw new StatementFormatError('Lotte official connection failed')
    }
    throw error
  }
}
