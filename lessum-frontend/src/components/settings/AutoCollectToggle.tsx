'use client'

import { useState, useTransition } from 'react'
import { cn } from 'cn'

import { setAutoCollect } from '@/lib/settings/actions'

interface AutoCollectToggleProps {
  defaultEnabled: boolean
}

export function AutoCollectToggle({ defaultEnabled }: AutoCollectToggleProps) {
  const [isEnabled, setIsEnabled] = useState(defaultEnabled)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function handleToggle() {
    const next = !isEnabled
    setIsEnabled(next)
    setError(null)

    startTransition(async () => {
      const result = await setAutoCollect(next)
      if (result.error) {
        setIsEnabled(!next)
        setError(result.error)
      }
    })
  }

  return (
    <div className="flex flex-col gap-1">
      <div className="flex h-11 items-center gap-3">
        <button
          type="button"
          role="switch"
          aria-checked={isEnabled}
          aria-label="자동 수집"
          disabled={isPending}
          onClick={handleToggle}
          className={cn(
            'h-8 w-14 cursor-pointer rounded-full border transition-colors disabled:opacity-50',
            isEnabled ? 'bg-foreground/60' : 'bg-muted',
          )}
        >
          <span
            className={cn(
              'block size-6 rounded-full bg-background shadow transition-transform',
              isEnabled ? 'translate-x-7' : 'translate-x-1',
            )}
          />
        </button>
        <p className="text-base font-bold">{isEnabled ? '켜짐' : '꺼짐'}</p>
      </div>
      {error && <p className="text-[13px] text-destructive">{error}</p>}
    </div>
  )
}
