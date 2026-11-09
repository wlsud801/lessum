import { Router } from 'express'

import { ApiError } from '../lib/errors.js'
import { isUuidString } from '../lib/manual-transaction.js'
import { requireAuth } from '../middleware/auth.js'
import {
  createManualCollectRun,
  getCollectRunById,
  getLatestCollectRun,
} from '../services/collect-runs.js'

export const collectRunsRouter = Router()

collectRunsRouter.post('/', requireAuth, async (req, res, next) => {
  try {
    res.status(202).json(await createManualCollectRun(req.user!.id))
  } catch (error) {
    next(error)
  }
})

collectRunsRouter.get('/latest', requireAuth, async (req, res, next) => {
  try {
    res.json(await getLatestCollectRun(req.user!.id))
  } catch (error) {
    next(error)
  }
})

collectRunsRouter.get('/:id', requireAuth, async (req, res, next) => {
  try {
    if (!isUuidString(req.params.id)) {
      throw new ApiError(
        400,
        'INVALID_COLLECT_RUN_ID',
        '수집 실행 ID가 올바르지 않습니다.',
      )
    }
    res.json(await getCollectRunById(req.user!.id, req.params.id))
  } catch (error) {
    next(error)
  }
})
