import Link from 'next/link'
import { cn } from 'cn'

interface AppSidebarProps {
  email?: string
  active: 'dashboard' | 'transactions'
}

const MENU_ITEMS = [
  { id: 'dashboard', label: '대시보드', href: '/home' },
  { id: 'transactions', label: '거래 내역', href: '/transactions' },
] as const

const DISABLED_ITEMS = ['정기 거래', '설정']

const ITEM_CLASS =
  'flex h-11 w-full items-center justify-center rounded-lg border text-[15px] font-bold'

export function AppSidebar({ email, active }: AppSidebarProps) {
  return (
    <aside className="flex w-[216px] shrink-0 flex-col gap-5 border-r bg-muted/40 p-6">
      <p className="text-[22px] font-bold">Lessum</p>
      <nav className="flex flex-col gap-5">
        {MENU_ITEMS.map((itItem) => (
          <Link
            key={itItem.id}
            href={itItem.href}
            aria-current={active === itItem.id ? 'page' : undefined}
            className={cn(
              ITEM_CLASS,
              active === itItem.id
                ? 'bg-accent text-accent-foreground'
                : 'bg-background hover:bg-accent',
            )}
          >
            {itItem.label}
          </Link>
        ))}
        {DISABLED_ITEMS.map((itLabel) => (
          <button
            key={itLabel}
            type="button"
            disabled
            title="준비 중입니다"
            className={cn(
              ITEM_CLASS,
              'cursor-not-allowed bg-background text-muted-foreground opacity-60',
            )}
          >
            {itLabel}
          </button>
        ))}
      </nav>
      <div className="text-[13px] text-muted-foreground">
        <p>계정</p>
        <p className="break-all">{email ?? '-'}</p>
      </div>
    </aside>
  )
}
