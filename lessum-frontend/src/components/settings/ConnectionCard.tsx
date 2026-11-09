import Link from 'next/link'

import { Card } from '@/components/ui/card'

interface ConnectionCardProps {
  title: string
  status: string
  lines: string[]
  action: string
  href?: string
}

export function ConnectionCard({
  title,
  status,
  lines,
  action,
  href,
}: ConnectionCardProps) {
  const card = (
    <Card className="h-full min-h-[260px] justify-between gap-3 bg-muted/40 p-6 transition-colors group-hover/connection:bg-muted/70">
      <p className="text-lg font-bold">{title}</p>
      <p className="text-[22px] font-bold">{status}</p>
      <div className="flex flex-col text-sm text-muted-foreground">
        {lines.map((itLine) => (
          <p key={itLine}>{itLine}</p>
        ))}
      </div>
      <p className="text-[15px] font-bold">{action}</p>
    </Card>
  )

  if (href) {
    return (
      <Link href={href} className="group/connection block cursor-pointer">
        {card}
      </Link>
    )
  }

  return card
}
