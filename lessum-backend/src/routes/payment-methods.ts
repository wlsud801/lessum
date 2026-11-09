import { Router } from 'express'

import { requireAuth } from '../middleware/auth.js'
import { getPaymentMethods } from '../services/payment-methods.js'

export const paymentMethodsRouter = Router()

paymentMethodsRouter.get('/', requireAuth, async (req, res, next) => {
  try {
    res.json(await getPaymentMethods(req.user!.id))
  } catch (error) {
    next(error)
  }
})
