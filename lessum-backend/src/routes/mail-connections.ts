import { Router } from 'express'

import { ApiError } from '../lib/errors.js'
import {
  MAX_APP_PASSWORD_LENGTH,
  isNaverEmail,
  listNaverMailboxes,
  verifyNaverLogin,
} from '../lib/naver-imap.js'
import { requireAuth } from '../middleware/auth.js'
import { userRateLimit } from '../middleware/user-rate-limit.js'
import { disconnectMail } from '../services/auto-register.js'
import {
  assertNotActivelyConnected,
  getConnectionCredentials,
  savePendingConnection,
} from '../services/mail-connections.js'

export const mailConnectionsRouter = Router()

const verifyRateLimit = userRateLimit({
  limit: 5,
  code: 'MAIL_VERIFY_RATE_LIMITED',
  message: '연결 확인 요청이 너무 많습니다. 잠시 후 다시 시도해주세요.',
})

const mailboxesRateLimit = userRateLimit({
  limit: 10,
  code: 'MAIL_MAILBOXES_RATE_LIMITED',
  message: '메일함 조회 요청이 너무 많습니다. 잠시 후 다시 시도해주세요.',
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

mailConnectionsRouter.get(
  '/mailboxes',
  requireAuth,
  mailboxesRateLimit,
  async (req, res, next) => {
    try {
      const { email, appPassword } = await getConnectionCredentials(
        req.user!.id,
      )
      const mailboxes = await listNaverMailboxes(email, appPassword)

      res.json({ email, mailboxes })
    } catch (error) {
      next(error)
    }
  },
)

mailConnectionsRouter.delete('/', requireAuth, async (req, res, next) => {
  try {
    await disconnectMail(req.user!.id)

    res.status(204).end()
  } catch (error) {
    next(error)
  }
})
