import type { NextFunction, Request, Response } from 'express'

import { ApiError } from '../lib/errors.js'

export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction,
) {
  if (err instanceof ApiError) {
    return res.status(err.status).json({ code: err.code, message: err.message })
  }
  console.error('unhandled error', err instanceof Error ? err.name : 'unknown')
  res.status(500).json({
    code: 'INTERNAL_ERROR',
    message: '일시적인 오류가 발생했습니다. 잠시 후 다시 시도해주세요.',
  })
}
