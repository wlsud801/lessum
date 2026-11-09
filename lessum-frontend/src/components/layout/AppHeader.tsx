'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { cn } from 'cn'

import { buttonVariants } from '@/components/ui/button'

interface AppHeaderProps {
  email?: string
}

const MENU_ITEMS = [
  { id: 'overview', label: '한눈에', href: '/home' },
  { id: 'daily', label: '하루하루', href: '/transactions' },
] as const

const DISABLED_ITEMS = ['달마다', '나의 가계부']

const ITEM_CLASS = 'h-11 w-36 text-[15px] font-bold'

export function AppHeader({ email }: AppHeaderProps) {
  const pathname = usePathname()

  return (
    <header className="fixed inset-x-0 top-0 z-50 flex h-20 items-center justify-between border-b bg-muted px-8">
      <Link href="/home" className="w-48 text-[22px] font-bold">
        Lessum
      </Link>
      <nav className="flex items-center gap-3">
        {MENU_ITEMS.map((itItem) => {
          const isActive = pathname.startsWith(itItem.href)

          return (
            <Link
              key={itItem.id}
              href={itItem.href}
              aria-current={isActive ? 'page' : undefined}
              className={cn(
                buttonVariants({ variant: isActive ? 'default' : 'outline' }),
                ITEM_CLASS,
              )}
            >
              {itItem.label}
            </Link>
          )
        })}
        {DISABLED_ITEMS.map((itLabel) => (
          <button
            key={itLabel}
            type="button"
            disabled
            title="준비 중입니다"
            className={cn(buttonVariants({ variant: 'outline' }), ITEM_CLASS)}
          >
            {itLabel}
          </button>
        ))}
      </nav>
      <div className="w-48 text-[13px] text-muted-foreground">
        <p>계정</p>
        <p className="break-all">{email ?? '-'}</p>
      </div>
    </header>
  )
}
