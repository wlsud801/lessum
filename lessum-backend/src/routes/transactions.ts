import { Router } from 'express'

import { requireAuth } from '../middleware/auth.js'
import {
  assertValidMonth,
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
