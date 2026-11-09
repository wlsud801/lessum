import { Router } from 'express'

import { ApiError } from '../lib/errors.js'
import {
  isUuidString,
  parseManualTransactionInput,
} from '../lib/manual-transaction.js'
import { requireAuth } from '../middleware/auth.js'
import {
  assertValidMonth,
  createManualTransaction,
  deleteTransaction,
  getMonthlyTransactions,
  getReviewCount,
  updateTransaction,
} from '../services/transactions.js'

function assertTransactionId(value: unknown): asserts value is string {
  if (!isUuidString(value)) {
    throw new ApiError(400, 'INVALID_TRANSACTION_ID', '거래 ID가 올바르지 않습니다.')
  }
}

export const transactionsRouter = Router()

transactionsRouter.get('/', requireAuth, async (req, res, next) => {
  try {
    const month = req.query.month
    assertValidMonth(month)
    res.json(await getMonthlyTransactions(req.user!.id, month))
  } catch (error) {
    next(error)
  }
})

transactionsRouter.get('/review-count', requireAuth, async (req, res, next) => {
  try {
    res.json(await getReviewCount(req.user!.id))
  } catch (error) {
    next(error)
  }
})

transactionsRouter.post('/', requireAuth, async (req, res, next) => {
  try {
    const input = parseManualTransactionInput(req.body)
    res.status(201).json(await createManualTransaction(req.user!.id, input))
  } catch (error) {
    next(error)
  }
})

transactionsRouter.patch('/:id', requireAuth, async (req, res, next) => {
  try {
    assertTransactionId(req.params.id)
    const input = parseManualTransactionInput(req.body)
    res.json(await updateTransaction(req.user!.id, req.params.id, input))
  } catch (error) {
    next(error)
  }
})

transactionsRouter.delete('/:id', requireAuth, async (req, res, next) => {
  try {
    assertTransactionId(req.params.id)
    await deleteTransaction(req.user!.id, req.params.id)
    res.status(204).end()
  } catch (error) {
    next(error)
  }
})
