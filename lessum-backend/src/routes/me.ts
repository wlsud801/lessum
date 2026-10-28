import { Router } from 'express'

import { ApiError } from '../lib/errors.js'
import { supabaseAdmin } from '../lib/supabase.js'
import { requireAuth } from '../middleware/auth.js'

export const meRouter = Router()

meRouter.get('/', requireAuth, async (req, res, next) => {
  try {
    const userId = req.user!.id

    const [profile, consents] = await Promise.all([
      supabaseAdmin.from('profiles').select('*').eq('id', userId).single(),
      supabaseAdmin
        .from('user_consents')
        .select('consent_type, version, agreed_at')
        .eq('user_id', userId)
        .order('agreed_at', { ascending: false }),
    ])

    if (profile.error || consents.error) {
      throw new ApiError(
        500,
        'PROFILE_LOAD_FAILED',
        '프로필을 불러오지 못했습니다.',
      )
    }

    res.json({
      id: userId,
      email: req.user!.email,
      profile: profile.data,
      consents: consents.data,
    })
  } catch (error) {
    next(error)
  }
})
