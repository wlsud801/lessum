import ExcelJS from 'exceljs'

import { StatementFormatError } from './errors.js'
import type { SamsungSectionCheck } from './statement.js'
import { collapseWhitespace } from './text.js'
import { validateZip } from './zip.js'

export const PURCHASE_HEADERS = [
  '이용일', '이용구분', '가맹점', '이용금액', '총할부금액', '이용혜택', '혜택금액',
  '개월', '회차', '원금', '이자/수수료', '포인트명', '적립금액', '입금후잔액',
] as const
export const FOREIGN_HEADERS = [
  '이용일', '접수일', '가맹점', '업종', '국가', '현지이용금액', '화폐단위',
  '접수금액(US$)', '환율', '원화환산', '해외사용 수수료 (0.2%)', '청구금액',
] as const
export const CANCEL_SHEET = '결제 취소내역(전월 명세서 발송 이후)'

const CANCEL_HEADERS = ['이용일', '이용자', '이용가맹점', '상품명', '취소금액'] as const
const SUMMARY_HEADERS = ['이용자', '카드번호/대출번호', '상품명', '원금', '이자/수수료'] as const
const EXPECTED_SHEETS = ['청구요약', '일시불', '할부', '해외이용', CANCEL_SHEET]
const MAX_ROWS = 10000
const MAX_COLUMNS = 20
const DATE_PATTERN = /^\d{8}$/

export class SamsungExportError extends StatementFormatError {
  constructor(message: string) {
    super(message)
    this.name = 'SamsungExportError'
  }
}

export type Cell = unknown
export type SheetRows = Record<string, Cell[][]>

export interface ExportPurchase {
  source_row: string
  section: 'D0' | 'D1'
  raw_date: string
  merchant: string
  original_amount: number
  billed_principal_krw: number
  fee_krw: number
  billed_amount_krw: number
  installment_months: number | null
  installment_round: number | null
  benefits: { label: string; amount_krw: number | null }[]
}

export interface ExportReference {
  kind: 'foreign_detail_reference' | 'cancellation_reference'
  source_row: string
  raw_date: string
  merchant: string
  amount_krw: number
  posting_status: string
  local_amount?: string
  local_currency?: string
  converted_krw?: number
  foreign_fee_krw?: number
  components_match?: boolean
}

export interface ExportResult {
  purchases: ExportPurchase[]
  references: ExportReference[]
  sections: Record<string, SamsungSectionCheck>
  card_summary_total_krw: number
  card_summary_matches: boolean
}

const isEmpty = (value: Cell) => value === null || value === undefined || value === ''

export function text(value: Cell): string {
  return value === null || value === undefined ? '' : collapseWhitespace(String(value))
}

export function integer(value: Cell, required = false): number | null {
  const normalized = text(value).replaceAll(',', '')
  if (!normalized) {
    if (required) {
      throw new SamsungExportError('Required monetary cell is blank')
    }
    return null
  }
  if (!/^[+-]?\d+(\.\d+)?$/.test(normalized)) {
    throw new SamsungExportError('Unsupported numeric cell')
  }
  const number = Number(normalized)
  if (!Number.isSafeInteger(number)) {
    throw new SamsungExportError('Expected an integer KRW amount or count')
  }
  return number
}

const requiredInteger = (value: Cell) => integer(value, true) as number

function headersMatch(row: Cell[] | undefined, expected: readonly string[]): boolean {
  return (
    row !== undefined &&
    expected.every((header, index) => row[index] === header) &&
    row.slice(expected.length).every(isEmpty)
  )
}

function readPurchaseSheet(name: string, code: 'D0' | 'D1', rows: Cell[][]) {
  if (!headersMatch(rows[2], PURCHASE_HEADERS)) {
    throw new SamsungExportError('Purchase export columns changed')
  }

  const purchases: ExportPurchase[] = []
  let current: ExportPurchase | null = null
  let count = 0
  let benefitCount = 0
  let totals: { principal: number; fees: number } | null = null
  let principalSum = 0
  let feeSum = 0

  rows.slice(3).forEach((values, offset) => {
    const number = offset + 4
    const rawDate = text(values[0])
    const merchant = text(values[2])

    if (DATE_PATTERN.test(rawDate)) {
      if (totals !== null) {
        throw new SamsungExportError('Purchase appears after section total')
      }
      const principal = requiredInteger(values[9])
      const fee = requiredInteger(values[10])
      current = {
        source_row: `${name}:${number}`,
        section: code,
        raw_date: rawDate,
        merchant,
        original_amount: requiredInteger(values[3]),
        billed_principal_krw: principal,
        fee_krw: fee,
        billed_amount_krw: principal + fee,
        installment_months: integer(values[7]),
        installment_round: integer(values[8]),
        benefits: [],
      }
      if (!merchant) {
        throw new SamsungExportError('Purchase merchant missing')
      }
      purchases.push(current)
      count += 1
      principalSum += principal
      feeSum += fee
    } else if (!rawDate && merchant === `${name}합계`) {
      if (totals !== null) {
        throw new SamsungExportError('Duplicate export total')
      }
      totals = { principal: requiredInteger(values[9]), fees: requiredInteger(values[10]) }
      current = null
      return
    } else if (!rawDate && !merchant) {
      if (!text(values[5]) && !text(values[6])) {
        if (values.some((value) => !['', '0', '0.0'].includes(text(value)))) {
          throw new SamsungExportError('Unknown blank-date export row')
        }
        return
      }
      if (
        current === null ||
        [3, 4, 7, 8, 9, 10, 12, 13].some((j) => ![null, 0].includes(integer(values[j])))
      ) {
        throw new SamsungExportError('Unlinked or monetary continuation row')
      }
      benefitCount += 1
    } else {
      throw new SamsungExportError('Unrecognized dated export row')
    }

    if (text(values[5])) {
      current!.benefits.push({ label: text(values[5]), amount_krw: integer(values[6]) })
    }
  })

  const declared = totals as { principal: number; fees: number } | null
  const section: SamsungSectionCheck = {
    row_count: count,
    benefit_continuation_rows: benefitCount,
    billed_principal_krw: principalSum,
    fee_krw: feeSum,
    declared_principal_krw: declared ? declared.principal : null,
    declared_fees_krw: declared ? declared.fees : null,
    amount_matches:
      declared !== null && principalSum === declared.principal && feeSum === declared.fees,
  }
  return { purchases, section }
}

function readForeignSheet(rows: Cell[][]) {
  if (!headersMatch(rows[2], FOREIGN_HEADERS)) {
    throw new SamsungExportError('Foreign export columns changed')
  }

  const references: ExportReference[] = []
  let foreignTotal = 0
  let declared: number | null = null
  let count = 0

  rows.slice(3).forEach((values, offset) => {
    const number = offset + 4
    if (DATE_PATTERN.test(text(values[0]))) {
      if (declared !== null) {
        throw new SamsungExportError('Foreign row appears after total')
      }
      const value = requiredInteger(values[11])
      const converted = requiredInteger(values[9])
      const fee = requiredInteger(values[10])
      references.push({
        kind: 'foreign_detail_reference',
        source_row: `DE:${number}`,
        raw_date: text(values[0]),
        merchant: text(values[2]),
        amount_krw: value,
        local_amount: text(values[5]),
        local_currency: text(values[6]),
        converted_krw: converted,
        foreign_fee_krw: fee,
        components_match: converted + fee === value,
        posting_status: 'reference_only',
      })
      foreignTotal += value
      count += 1
    } else if (text(values[2]) === '해외매출합계') {
      if (declared !== null) {
        throw new SamsungExportError('Duplicate foreign export total')
      }
      declared = requiredInteger(values[11])
    } else {
      throw new SamsungExportError('Unexpected foreign export row')
    }
  })

  const declaredTotal = declared as number | null
  const section: SamsungSectionCheck = {
    row_count: count,
    billed_amount_krw: foreignTotal,
    declared_billed_amount_krw: declaredTotal,
    amount_matches: foreignTotal === declaredTotal,
  }
  return { references, section }
}

function readCancellationSheet(rows: Cell[][]): ExportReference[] {
  if (!headersMatch(rows[2], CANCEL_HEADERS)) {
    throw new SamsungExportError('Cancellation export columns changed')
  }

  return rows.slice(3).map((values, offset) => {
    if (!DATE_PATTERN.test(text(values[0]))) {
      throw new SamsungExportError('Unexpected cancellation date')
    }
    return {
      kind: 'cancellation_reference',
      source_row: `DF:${offset + 4}`,
      raw_date: text(values[0]),
      merchant: text(values[2]),
      amount_krw: requiredInteger(values[4]),
      posting_status: 'requires_linkage',
    }
  })
}

export function parseExportSheets(sheets: SheetRows): ExportResult {
  const names = Object.keys(sheets)
  if (
    names.length !== EXPECTED_SHEETS.length ||
    !EXPECTED_SHEETS.every((name) => names.includes(name))
  ) {
    throw new SamsungExportError('Export sheet schema changed; review required')
  }
  if (
    names.some(
      (name) =>
        sheets[name].length > MAX_ROWS ||
        Math.max(0, ...sheets[name].map((row) => row.length)) > MAX_COLUMNS,
    )
  ) {
    throw new SamsungExportError('Export sheet exceeds parsing limits')
  }

  const purchases: ExportPurchase[] = []
  const sections: Record<string, SamsungSectionCheck> = {}
  for (const [name, code] of [['일시불', 'D0'], ['할부', 'D1']] as const) {
    const sheet = readPurchaseSheet(name, code, sheets[name])
    purchases.push(...sheet.purchases)
    sections[code] = sheet.section
  }

  const foreign = readForeignSheet(sheets['해외이용'])
  sections.DE = foreign.section
  const references = [...foreign.references, ...readCancellationSheet(sheets[CANCEL_SHEET])]

  const summaryRows = sheets['청구요약']
  if (!headersMatch(summaryRows[2], SUMMARY_HEADERS)) {
    throw new SamsungExportError('Card summary export columns changed')
  }
  const cardTotal = summaryRows
    .slice(3)
    .reduce((sum, row) => sum + requiredInteger(row[3]) + requiredInteger(row[4]), 0)

  return {
    purchases,
    references,
    sections,
    card_summary_total_krw: cardTotal,
    card_summary_matches:
      cardTotal === purchases.reduce((sum, purchase) => sum + purchase.billed_amount_krw, 0),
  }
}

function normalizeCell(value: ExcelJS.CellValue): Cell {
  if (value === null || value === undefined) {
    return null
  }
  if (value instanceof Date) {
    return value.toISOString()
  }
  if (typeof value === 'object') {
    if ('richText' in value) {
      return value.richText.map((part) => part.text).join('')
    }
    if ('result' in value) {
      return normalizeCell(value.result as ExcelJS.CellValue)
    }
    if ('text' in value) {
      return value.text
    }
    if ('error' in value) {
      return value.error
    }
    return String(value)
  }
  return value
}

export async function loadWorkbookRows(data: Uint8Array): Promise<SheetRows> {
  const workbook = new ExcelJS.Workbook()
  try {
    await workbook.xlsx.load(Buffer.from(data) as unknown as ExcelJS.Buffer)
  } catch {
    throw new SamsungExportError('Cannot read the exported workbook')
  }

  const sheets: SheetRows = {}
  for (const sheet of workbook.worksheets) {
    if (sheet.rowCount > MAX_ROWS || sheet.columnCount > MAX_COLUMNS) {
      throw new SamsungExportError('Export sheet exceeds parsing limits')
    }

    const rows: Cell[][] = []
    for (let rowNumber = 1; rowNumber <= sheet.rowCount; rowNumber++) {
      const row = sheet.getRow(rowNumber)
      rows.push(
        Array.from({ length: sheet.columnCount }, (_, index) =>
          normalizeCell(row.getCell(index + 1).value),
        ),
      )
    }
    while (rows.length > 0 && rows[rows.length - 1].every(isEmpty)) {
      rows.pop()
    }
    sheets[sheet.name] = rows
  }
  return sheets
}

export async function readExport(data: Uint8Array): Promise<ExportResult> {
  validateZip(data)
  return parseExportSheets(await loadWorkbookRows(data))
}
