import { rateLimit } from 'express-rate-limit'

import { ApiError } from '../lib/errors.js'

interface UserRateLimitOptions {
  limit: number
  code: string
  message: string
  windowMs?: number
}

export function userRateLimit({
  limit,
  code,
  message,
  windowMs = 10 * 60_000,
}: UserRateLimitOptions) {
  return rateLimit({
    windowMs,
    limit,
    keyGenerator: (req) => req.user!.id,
    standardHeaders: true,
    legacyHeaders: false,
    handler: (_req, _res, next) => next(new ApiError(429, code, message)),
  })
}
