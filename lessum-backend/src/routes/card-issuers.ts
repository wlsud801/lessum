import { Router } from 'express'

import { CARD_ISSUERS } from '../lib/card-issuers.js'
import { requireAuth } from '../middleware/auth.js'

export const cardIssuersRouter = Router()

cardIssuersRouter.get('/', requireAuth, (_req, res) => {
  res.json({
    issuers: CARD_ISSUERS.map((issuer) => ({
      id: issuer.id,
      name: issuer.name,
      supported: issuer.supported,
      needs_statement_password: issuer.needsStatementPassword,
    })),
  })
})
