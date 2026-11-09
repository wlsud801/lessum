import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

import { ApiError } from './errors.js'
import { parseManualTransactionInput } from './manual-transaction.js'

const validBody = {
  transaction_type: 'ACCOUNT_EXPENSE',
  transaction_date: '2026-11-05',
  merchant_name: '  동네식당  ',
  amount: 18000,
}

describe('parseManualTransactionInput', () => {
  it('유효한 입력을 정규화해서 반환한다', () => {
    const input = parseManualTransactionInput({
      ...validBody,
      payment_method_id: '00000000-0000-4000-8000-000000000001',
      memo: '  점심  ',
      client_request_id: '00000000-0000-4000-8000-000000000002',
    })
    assert.deepEqual(input, {
      transactionType: 'ACCOUNT_EXPENSE',
      transactionDate: '2026-11-05',
      merchantName: '동네식당',
      amount: 18000,
      paymentMethodId: '00000000-0000-4000-8000-000000000001',
      memo: '점심',
      clientRequestId: '00000000-0000-4000-8000-000000000002',
    })
  })

  it('선택 값이 없으면 null로 채운다', () => {
    const input = parseManualTransactionInput(validBody)
    assert.equal(input.paymentMethodId, null)
    assert.equal(input.memo, null)
    assert.equal(input.clientRequestId, null)
  })

  it('빈 문자열 메모는 null로 처리한다', () => {
    const input = parseManualTransactionInput({ ...validBody, memo: '   ' })
    assert.equal(input.memo, null)
  })

  const invalidCases: [string, Record<string, unknown>][] = [
    ['유형 누락', { ...validBody, transaction_type: undefined }],
    ['허용되지 않은 유형', { ...validBody, transaction_type: 'EXPENSE' }],
    ['잘못된 날짜', { ...validBody, transaction_date: '2026-02-30' }],
    ['날짜 형식 오류', { ...validBody, transaction_date: '11/05/2026' }],
    ['거래처 누락', { ...validBody, merchant_name: '   ' }],
    ['거래처 길이 초과', { ...validBody, merchant_name: '가'.repeat(101) }],
    ['금액 0원', { ...validBody, amount: 0 }],
    ['음수 금액', { ...validBody, amount: -1000 }],
    ['소수 금액', { ...validBody, amount: 100.5 }],
    ['문자열 금액', { ...validBody, amount: '18000' }],
    ['잘못된 수단 ID', { ...validBody, payment_method_id: 'not-a-uuid' }],
    ['잘못된 요청 ID', { ...validBody, client_request_id: '1234' }],
  ]

  for (const [label, body] of invalidCases) {
    it(`${label}이면 400 오류를 던진다`, () => {
      assert.throws(
        () => parseManualTransactionInput(body),
        (error: unknown) =>
          error instanceof ApiError && error.status === 400,
      )
    })
  }
})
