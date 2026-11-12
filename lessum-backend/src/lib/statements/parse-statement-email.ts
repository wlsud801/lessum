import { parseEmail } from './email.js'
import {
  collectLotteEmail,
  hasLotteStatementLink,
  type LotteOnlineDeps,
} from './lotte-online.js'
import {
  SAMSUNG_SENDER,
  collectSamsungEmail,
  type OnlineDeps,
} from './samsung-online.js'
import type { StatementResult } from './statement.js'

export { SAMSUNG_SENDER }

export async function parseStatementEmail(
  data: Uint8Array,
  issuer: string,
  statementPassword?: string | null,
  deps?: OnlineDeps & LotteOnlineDeps,
): Promise<StatementResult> {
  if (issuer === 'samsung') {
    return collectSamsungEmail(data, statementPassword, deps)
  }
  if (issuer === 'lotte' && (await hasLotteStatementLink(data))) {
    return collectLotteEmail(data, statementPassword, deps)
  }
  return parseEmail(data, issuer, statementPassword)
}
