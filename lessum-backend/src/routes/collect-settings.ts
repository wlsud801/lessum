import { Router } from 'express'

import { todayInKst } from '../lib/collect-schedule.js'
import { parseCollectSettingsInput } from '../lib/collect-settings.js'
import { requireAuth } from '../middleware/auth.js'
import { saveCollectSettings } from '../services/collect-settings.js'
import { assertConnectionUsable } from '../services/mail-connections.js'

export const collectSettingsRouter = Router()

collectSettingsRouter.put('/', requireAuth, async (req, res, next) => {
  try {
    const today = todayInKst()
    const input = parseCollectSettingsInput(req.body, today)
    const userId = req.user!.id

    await assertConnectionUsable(userId)
    const cards = await saveCollectSettings(userId, input, today)

    res.json({
      mailbox: { name: input.mailboxName, imap_name: input.mailboxImapName },
      start_date: input.startDate,
      cards,
    })
  } catch (error) {
    next(error)
  }
})
