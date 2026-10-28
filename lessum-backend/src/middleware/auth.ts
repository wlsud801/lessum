import type { NextFunction, Request, Response } from 'express'

import { unauthorized } from '../lib/errors.js'
import { supabaseAnon } from '../lib/supabase.js'

export interface AuthUser {
  id: string
  email: string | undefined
}

declare module 'express-serve-static-core' {
  interface Request {
    user?: AuthUser
    accessToken?: string
  }
}

export async function requireAuth(
  req: Request,
  _res: Response,
  next: NextFunction,
) {
  const header = req.headers.authorization
  const token = header?.startsWith('Bearer ') ? header.slice(7) : undefined
  if (!token) {
    return next(unauthorized())
  }

  const { data, error } = await supabaseAnon.auth.getUser(token)
  if (error || !data.user) {
    return next(unauthorized())
  }

  req.user = { id: data.user.id, email: data.user.email }
  req.accessToken = token
  next()
}
