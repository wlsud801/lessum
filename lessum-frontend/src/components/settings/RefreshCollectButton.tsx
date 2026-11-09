'use client'

import { useEffect, useRef, useState } from 'react'
import Image from 'next/image'
import { useRouter } from 'next/navigation'
import { cn } from 'cn'

import { checkCollectRun, startManualCollect } from '@/lib/settings/actions'

const POLL_INTERVAL_MS = 3000
const POLL_TIMEOUT_MS = 120000

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export function RefreshCollectButton() {
  const router = useRouter()
  const [isChecking, setIsChecking] = useState(false)
  const [toast, setToast] = useState<string | null>(null)
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    return () => {
      if (toastTimer.current) {
        clearTimeout(toastTimer.current)
      }
    }
  }, [])

  function showToast(message: string) {
    setToast(message)
    if (toastTimer.current) {
      clearTimeout(toastTimer.current)
    }
    toastTimer.current = setTimeout(() => setToast(null), 5000)
  }

  async function handleClick() {
    setIsChecking(true)
    setToast(null)

    const started = await startManualCollect()
    if (started.error || !started.runId) {
      showToast(started.error ?? '새 명세서 조회를 시작하지 못했습니다.')
      setIsChecking(false)
      return
    }

    const deadline = Date.now() + POLL_TIMEOUT_MS
    for (;;) {
      await sleep(POLL_INTERVAL_MS)

      const run = await checkCollectRun(started.runId)
      if (run.error) {
        showToast(run.error)
        break
      }
      if (run.status === 'completed') {
        showToast(
          (run.statementsFound ?? 0) > 0
            ? '새 메일을 확인했어요. 새 명세서를 가져왔어요.'
            : '새 메일을 확인했어요. 새 명세서는 없어요.',
        )
        router.refresh()
        break
      }
      if (run.status === 'failed') {
        showToast('메일 확인에 실패했어요. 잠시 후 다시 시도해주세요.')
        router.refresh()
        break
      }
      if (Date.now() > deadline) {
        showToast('확인이 오래 걸리고 있어요. 결과는 잠시 후 반영돼요.')
        router.refresh()
        break
      }
    }

    setIsChecking(false)
  }

  return (
    <>
      <div className="group relative">
        <button
          type="button"
          aria-label="새 명세서 조회"
          disabled={isChecking}
          onClick={handleClick}
          className="flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-md border bg-background transition-colors hover:bg-muted disabled:opacity-50"
        >
          <Image
            src="/icons/refresh.svg"
            alt=""
            width={20}
            height={20}
            className={cn(isChecking && 'animate-spin')}
          />
        </button>
        <span
          role="tooltip"
          className="pointer-events-none absolute top-full left-1/2 z-10 mt-2 -translate-x-1/2 rounded-md bg-foreground px-2.5 py-1.5 text-xs whitespace-nowrap text-background opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100"
        >
          {isChecking
            ? '새 명세서를 불러오고 있어요'
            : '메일함에서 새 명세서를 불러와요'}
        </span>
      </div>
      {toast && (
        <div
          role="status"
          className="fixed top-24 left-1/2 z-50 -translate-x-1/2 rounded-xl border bg-background px-6 py-3 text-sm font-bold shadow-lg"
        >
          {toast}
        </div>
      )}
    </>
  )
}
