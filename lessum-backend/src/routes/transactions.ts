import { Router } from 'express'

import { parseManualTransactionInput } from '../lib/manual-transaction.js'
import { requireAuth } from '../middleware/auth.js'
import {
  assertValidMonth,
  createManualTransaction,
  getMonthlyTransactions,
} from '../services/transactions.js'

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

transactionsRouter.post('/', requireAuth, async (req, res, next) => {
  try {
    const input = parseManualTransactionInput(req.body)
    res.status(201).json(await createManualTransaction(req.user!.id, input))
  } catch (error) {
    next(error)
  }
})
