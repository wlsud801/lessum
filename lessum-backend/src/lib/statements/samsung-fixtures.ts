import ExcelJS from 'exceljs'

import {
  CANCEL_SHEET,
  FOREIGN_HEADERS,
  PURCHASE_HEADERS,
  type Cell,
  type SheetRows,
} from './samsung-export.js'
import type { SamsungReference } from './samsung.js'

export const SUMMARY_HEADERS = ['이용자', '카드번호/대출번호', '상품명', '원금', '이자/수수료']
export const CANCEL_HEADERS = ['이용일', '이용자', '이용가맹점', '상품명', '취소금액']

export const ONE: Cell[] = ['20260902', '본인', '같은상점', '100', '', '청구할인', '-5', '', '', 90, 0, '', 0, 0]
export const BENEFIT: Cell[] = ['', '', '', '', '', '해외수수료할인', '-5', '', '', 0, 0, '', 0, 0]
export const INSTALLMENT: Cell[] = ['20260902', '본인', '할부상점', '300', '', '이자면제', '-20', '3', '2', 100, 0, '', 0, 100]
export const FOREIGN: Cell[] = ['20260902', '20260903', '같은상점', '잡화', '국가', '1.00', 'USD', 1, '99', 99, 1, 100]
export const CANCEL: Cell[] = ['20260929', '본인', '환급', '일시불', -10]

export function totalRow(name: string, principal: number, fee = 0): Cell[] {
  return ['', '', `${name}합계`, '', '', '', '', '', '', principal, fee, '', 0, 0]
}

export function sheetsFixture({
  orphan = false,
  footer = 180,
}: { orphan?: boolean; footer?: number } = {}): SheetRows {
  return {
    청구요약: [['청구요약'], [], [...SUMMARY_HEADERS], ['본인', 'MASKED', '카드', 280, 0]],
    일시불: [
      ['일시불'],
      [],
      [...PURCHASE_HEADERS],
      ...(orphan ? [BENEFIT] : []),
      ONE,
      BENEFIT,
      ONE,
      BENEFIT,
      totalRow('일시불', footer),
    ],
    할부: [['할부'], [], [...PURCHASE_HEADERS], INSTALLMENT, totalRow('할부', 100)],
    해외이용: [
      ['해외이용'],
      [],
      [...FOREIGN_HEADERS],
      FOREIGN,
      ['', '', '해외매출합계', '', '', '', '', 1, '', 99, 1, 100],
    ],
    [CANCEL_SHEET]: [[CANCEL_SHEET], [], [...CANCEL_HEADERS], CANCEL],
  }
}

export const REFERENCE: SamsungReference = {
  context: { payment_date: '2026-10-13', statement_month: '2026-10' },
  transactions: [
    { transaction_date: '2026-09-02', merchant: '같은상점', original_amount: 100, billed_amount_krw: 90 },
    { transaction_date: '2026-09-02', merchant: '같은상점', original_amount: 100, billed_amount_krw: 90 },
    { transaction_date: '2026-09-02', merchant: '할부상점', original_amount: 300, billed_amount_krw: 100 },
  ],
  validation: {
    sections: {
      D0: { declared_count: 2 },
      D1: { declared_count: 1 },
      DE: { declared_count: 1 },
    },
    declared_summary_krw: { 일시불: 180, 할부: 100 },
    declared_grand_total_krw: 280,
  },
}

export async function xlsxFromSheets(sheets: SheetRows): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook()
  for (const [name, rows] of Object.entries(sheets)) {
    const sheet = workbook.addWorksheet(name)
    rows.forEach((row, rowIndex) => {
      row.forEach((value, columnIndex) => {
        if (value !== null && value !== undefined && value !== '') {
          sheet.getCell(rowIndex + 1, columnIndex + 1).value = value as ExcelJS.CellValue
        }
      })
    })
  }
  return Buffer.from(await workbook.xlsx.writeBuffer())
}
