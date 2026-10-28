import { parseEmail } from './email.js'
import {
  SAMSUNG_SENDER,
  collectSamsungEmail,
  type OnlineDeps,
} from './samsung-online.js'
import type { StatementResult } from './statement.js'

export { SAMSUNG_SENDER }

export function parseStatementEmail(
  data: Uint8Array,
  issuer: string,
  statementPassword?: string | null,
  deps?: OnlineDeps,
): Promise<StatementResult> {
  return issuer === 'samsung'
    ? collectSamsungEmail(data, statementPassword, deps)
    : parseEmail(data, issuer, statementPassword)
}
