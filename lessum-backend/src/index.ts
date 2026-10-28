import cors from 'cors'
import express from 'express'
import rateLimit from 'express-rate-limit'

import { env } from './config/env.js'
import { errorHandler } from './middleware/error-handler.js'
import { cardIssuersRouter } from './routes/card-issuers.js'
import { collectSettingsRouter } from './routes/collect-settings.js'
import { mailConnectionsRouter } from './routes/mail-connections.js'
import { meRouter } from './routes/me.js'

const app = express()

app.use(cors({ origin: env.frontendUrl, credentials: true }))
app.use(express.json())
app.use(rateLimit({ windowMs: 60_000, limit: 120 }))

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' })
})

app.use('/me', meRouter)
app.use('/mail-connections', mailConnectionsRouter)
app.use('/card-issuers', cardIssuersRouter)
app.use('/collect-settings', collectSettingsRouter)

app.use(errorHandler)

app.listen(env.port, () => {
  console.log(`server listening on http://localhost:${env.port}`)
})
