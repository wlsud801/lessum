import { Router } from 'express'

import { assertStorageConsent } from '../lib/auto-register.js'
import { todayInKst } from '../lib/collect-schedule.js'
import { requireAuth } from '../middleware/auth.js'
import {
  disableAutoRegister,
  enableAutoRegister,
} from '../services/auto-register.js'

export const autoRegisterRouter = Router()

autoRegisterRouter.post('/enable', requireAuth, async (req, res, next) => {
  try {
    assertStorageConsent(req.body)

    res.json(await enableAutoRegister(req.user!.id, todayInKst()))
  } catch (error) {
    next(error)
  }
})

autoRegisterRouter.post('/disable', requireAuth, async (req, res, next) => {
  try {
    await disableAutoRegister(req.user!.id)

    res.status(204).end()
  } catch (error) {
    next(error)
  }
})
