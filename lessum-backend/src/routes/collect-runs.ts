import { Router } from 'express'

import { requireAuth } from '../middleware/auth.js'
import { getLatestCollectRun } from '../services/collect-runs.js'

export const collectRunsRouter = Router()

collectRunsRouter.get('/latest', requireAuth, async (req, res, next) => {
  try {
    res.json(await getLatestCollectRun(req.user!.id))
  } catch (error) {
    next(error)
  }
})
