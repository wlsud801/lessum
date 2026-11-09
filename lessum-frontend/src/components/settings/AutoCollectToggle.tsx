'use client'

import { useState } from 'react'
import { cn } from 'cn'

interface AutoCollectToggleProps {
  defaultEnabled: boolean
}

export function AutoCollectToggle({ defaultEnabled }: AutoCollectToggleProps) {
  const [isEnabled, setIsEnabled] = useState(defaultEnabled)

  return (
    <div className="flex h-11 items-center gap-3">
      <button
        type="button"
        role="switch"
        aria-checked={isEnabled}
        aria-label="자동 수집"
        onClick={() => setIsEnabled((prev) => !prev)}
        className={cn(
          'h-8 w-14 cursor-pointer rounded-full border transition-colors',
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
  )
}
