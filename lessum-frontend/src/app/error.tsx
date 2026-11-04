'use client'

import { useRouter } from 'next/navigation'
import { startTransition } from 'react'

import { Button } from '@/components/ui/button'

interface ErrorPageProps {
  error: Error & { digest?: string }
  reset: () => void
}

export default function ErrorPage({ reset }: ErrorPageProps) {
  const router = useRouter()

  const handleRetry = () => {
    startTransition(() => {
      router.refresh()
      reset()
    })
  }

  return (
    <main className="flex flex-1 flex-col items-center justify-center gap-4 px-4 text-center">
      <h1 className="text-xl font-bold">일시적인 오류가 발생했습니다</h1>
      <p className="text-sm text-muted-foreground">
        잠시 후 다시 시도해주세요.
      </p>
      <Button type="button" size="lg" onClick={handleRetry}>
        다시 시도
      </Button>
    </main>
  )
}
