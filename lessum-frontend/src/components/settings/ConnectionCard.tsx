import { Card } from '@/components/ui/card'

interface ConnectionCardProps {
  title: string
  status: string
  lines: string[]
  action: string
}

export function ConnectionCard({
  title,
  status,
  lines,
  action,
}: ConnectionCardProps) {
  return (
    <Card className="min-h-[260px] justify-between gap-3 bg-muted/40 p-6">
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
}
