'use client'

import { useRouter } from 'next/navigation'
import { useEffect } from 'react'

interface CollectRunPollerProps {
  intervalMs?: number
}

export function CollectRunPoller({ intervalMs = 4000 }: CollectRunPollerProps) {
  const router = useRouter()

  useEffect(() => {
    const id = setInterval(() => {
      router.refresh()
    }, intervalMs)
    return () => clearInterval(id)
  }, [router, intervalMs])

  return null
}
