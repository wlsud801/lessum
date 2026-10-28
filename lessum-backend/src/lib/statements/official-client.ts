import { SamsungExportError } from './samsung-export.js'

export const ORIGIN = 'https://bill.samsungcard.com'
export const PAGE = `${ORIGIN}/personal/statement/card/UBLDRP0201P4.jsp`
export const LOGIN_URL = `${ORIGIN}/ehub/rpc/LSECCommand`
export const EXPORT_URL = `${ORIGIN}/frontservice/exceldownload`
export const SUMMARY_URL = `${ORIGIN}/frontservice/SBLDRP0201S25`
export const MAX_RESPONSE_BYTES = 20 * 1024 * 1024

const ALLOWED_HOST = 'bill.samsungcard.com'
const MAX_REDIRECTS = 10
const REDIRECT_STATUSES = [301, 302, 303, 307, 308]
const DEFAULT_TIMEOUT_MS = 30_000

export class SamsungTransportError extends Error {
  constructor() {
    super('Samsung official connection failed')
    this.name = 'SamsungTransportError'
  }
}

export interface SamsungRequest {
  method: 'GET' | 'POST'
  url: string
  headers?: Record<string, string>
  body?: string
  maxBytes?: number
}

export interface SamsungResponse {
  status: number
  headers: Headers
  body: Buffer
}

export interface SamsungHttp {
  send(request: SamsungRequest): Promise<SamsungResponse>
}

function assertOfficialUrl(url: URL) {
  if (
    url.protocol !== 'https:' ||
    url.hostname !== ALLOWED_HOST ||
    (url.port !== '' && url.port !== '443') ||
    url.username !== '' ||
    url.password !== ''
  ) {
    throw new SamsungExportError('Cross-origin export redirect refused')
  }
}

export function resolveOfficialRedirect(location: string, base: string): URL {
  let target: URL
  try {
    target = new URL(location, base)
  } catch {
    throw new SamsungExportError('Cross-origin export redirect refused')
  }
  assertOfficialUrl(target)
  return target
}

function storeCookies(jar: Map<string, string>, headers: Headers) {
  for (const header of headers.getSetCookie()) {
    const [pair, ...attributes] = header.split(';')
    const separator = pair.indexOf('=')
    if (separator <= 0) {
      continue
    }
    const name = pair.slice(0, separator).trim()
    const value = pair.slice(separator + 1).trim()
    const expired = attributes.some((attribute) => {
      const [key, raw] = attribute.split('=').map((part) => part.trim())
      return (
        (key.toLowerCase() === 'max-age' && Number(raw) <= 0) ||
        (key.toLowerCase() === 'expires' && Date.parse(raw) < Date.now())
      )
    })
    if (expired) {
      jar.delete(name)
    } else {
      jar.set(name, value)
    }
  }
}

async function readBounded(response: Response, maxBytes: number): Promise<Buffer> {
  const reader = response.body?.getReader()
  if (!reader) {
    return Buffer.alloc(0)
  }

  const chunks: Uint8Array[] = []
  let total = 0
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) {
        break
      }
      chunks.push(value)
      total += value.length
      if (total > maxBytes) {
        await reader.cancel()
        break
      }
    }
  } catch {
    throw new SamsungTransportError()
  }
  return Buffer.concat(chunks)
}

export function createSamsungHttp(
  fetchImpl: typeof fetch = fetch,
  timeoutMs = DEFAULT_TIMEOUT_MS,
): SamsungHttp {
  const cookies = new Map<string, string>()

  return {
    async send(request) {
      let method = request.method
      let body = request.body
      let current = resolveOfficialRedirect(request.url, request.url)
      const headers: Record<string, string> = {
        'User-Agent': 'Mozilla/5.0',
        ...request.headers,
      }

      for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
        const cookieHeader = [...cookies]
          .map(([name, value]) => `${name}=${value}`)
          .join('; ')

        let response: Response
        try {
          response = await fetchImpl(current, {
            method,
            headers: cookieHeader ? { ...headers, Cookie: cookieHeader } : headers,
            body: method === 'GET' ? undefined : body,
            redirect: 'manual',
            signal: AbortSignal.timeout(timeoutMs),
          })
        } catch {
          throw new SamsungTransportError()
        }
        storeCookies(cookies, response.headers)

        const location = response.headers.get('location')
        if (REDIRECT_STATUSES.includes(response.status) && location) {
          await response.body?.cancel().catch(() => undefined)
          current = resolveOfficialRedirect(location, current.href)
          if ([301, 302, 303].includes(response.status) && method === 'POST') {
            method = 'GET'
            body = undefined
            delete headers['Content-Type']
          }
          continue
        }

        return {
          status: response.status,
          headers: response.headers,
          body: await readBounded(response, request.maxBytes ?? MAX_RESPONSE_BYTES),
        }
      }
      throw new SamsungExportError('Official request redirected too many times')
    },
  }
}
