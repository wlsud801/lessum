import { Router } from 'express'
import { rateLimit } from 'express-rate-limit'

import { ApiError } from '../lib/errors.js'
import {
  MAX_APP_PASSWORD_LENGTH,
  isNaverEmail,
  verifyNaverLogin,
} from '../lib/naver-imap.js'
import { requireAuth } from '../middleware/auth.js'
import {
  assertNotActivelyConnected,
  savePendingConnection,
} from '../services/mail-connections.js'

export const mailConnectionsRouter = Router()

const verifyRateLimit = rateLimit({
  windowMs: 10 * 60_000,
  limit: 5,
  keyGenerator: (req) => req.user!.id,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_req, _res, next) =>
    next(
      new ApiError(
        429,
        'MAIL_VERIFY_RATE_LIMITED',
        '연결 확인 요청이 너무 많습니다. 잠시 후 다시 시도해주세요.',
      ),
    ),
})

mailConnectionsRouter.post(
  '/verify',
  requireAuth,
  verifyRateLimit,
  async (req, res, next) => {
    try {
      const { email, app_password: appPassword } = req.body ?? {}

      if (typeof email !== 'string' || !isNaverEmail(email.trim())) {
        throw new ApiError(
          400,
          'INVALID_EMAIL',
          '네이버 이메일 주소를 입력해주세요.',
        )
      }
      if (
        typeof appPassword !== 'string' ||
        appPassword.length === 0 ||
        appPassword.length > MAX_APP_PASSWORD_LENGTH
      ) {
        throw new ApiError(
          400,
          'INVALID_APP_PASSWORD',
          '앱 비밀번호를 입력해주세요.',
        )
      }

      const userId = req.user!.id
      await assertNotActivelyConnected(userId)
      await verifyNaverLogin(email.trim(), appPassword)
      const connection = await savePendingConnection(
        userId,
        email.trim(),
        appPassword,
      )

      res.json({ ...connection, status: 'pending' })
    } catch (error) {
      next(error)
    }
  },
)
