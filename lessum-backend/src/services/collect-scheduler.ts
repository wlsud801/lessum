import { todayInKst } from '../lib/collect-schedule.js'
import { supabaseAdmin } from '../lib/supabase.js'
import { processQueuedRuns } from './collect-worker.js'

const DEFAULT_INTERVAL_MS = 5 * 60 * 1000

let timer: NodeJS.Timeout | null = null
let isTicking = false
let hasPendingKick = false

export async function enqueueDueRuns(): Promise<void> {
  const today = todayInKst()
  const due = await supabaseAdmin
    .from('card_collect_settings')
    .select('user_id, issuer')
    .eq('enabled', true)
    .lte('next_collect_on', today)
  if (due.error || due.data.length === 0) {
    return
  }

  const userIds = [...new Set(due.data.map((itRow) => itRow.user_id))]
  const [enabledUsers, activeRuns] = await Promise.all([
    supabaseAdmin
      .from('collect_settings')
      .select('user_id')
      .in('user_id', userIds)
      .eq('auto_register_enabled', true),
    supabaseAdmin
      .from('collect_runs')
      .select('user_id')
      .in('user_id', userIds)
      .in('status', ['queued', 'running']),
  ])
  if (enabledUsers.error || activeRuns.error) {
    return
  }

  const busy = new Set(activeRuns.data.map((itRow) => itRow.user_id))
  const eligible = enabledUsers.data
    .map((itRow) => itRow.user_id)
    .filter((itUserId) => !busy.has(itUserId))

  for (const userId of eligible) {
    const run = await supabaseAdmin
      .from('collect_runs')
      .insert({ user_id: userId, trigger: 'scheduled' })
      .select('id')
      .single()
    if (run.error) {
      console.error('scheduled collect run insert failed', run.error)
      continue
    }

    const issuers = due.data
      .filter((itRow) => itRow.user_id === userId)
      .map((itRow) => itRow.issuer)
    const cards = await supabaseAdmin.from('collect_run_cards').insert(
      issuers.map((issuer) => ({
        run_id: run.data.id,
        user_id: userId,
        issuer,
      })),
    )
    if (cards.error) {
      console.error('scheduled collect run cards insert failed', cards.error)
    }
  }
}

async function tick(): Promise<void> {
  if (isTicking) {
    hasPendingKick = true
    return
  }

  isTicking = true
  try {
    do {
      hasPendingKick = false
      await enqueueDueRuns()
      await processQueuedRuns()
    } while (hasPendingKick)
  } catch (error) {
    console.error('collect scheduler tick failed', error)
  } finally {
    isTicking = false
  }
}

export function kickCollectWorker(): void {
  void tick()
}

export function startCollectScheduler(
  intervalMs: number = DEFAULT_INTERVAL_MS,
): void {
  if (timer) {
    return
  }
  timer = setInterval(() => {
    void tick()
  }, intervalMs)
  timer.unref()
  void tick()
}

export function stopCollectScheduler(): void {
  if (timer) {
    clearInterval(timer)
    timer = null
  }
}
