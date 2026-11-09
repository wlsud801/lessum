import type { ReactNode } from 'react'
import { connection } from 'next/server'

import { AppHeader } from '@/components/layout/AppHeader'
import { getMe } from '@/lib/auth/api'

export default async function AppLayout({
  children,
}: {
  children: ReactNode
}) {
  await connection()

  const me = await getMe()

  return (
    <div className="flex min-h-full flex-1 flex-col">
      <AppHeader email={me?.email} />
      <main className="mx-auto flex w-full max-w-[1224px] flex-1 flex-col px-8 pt-28 pb-8">
        {children}
      </main>
    </div>
  )
}
