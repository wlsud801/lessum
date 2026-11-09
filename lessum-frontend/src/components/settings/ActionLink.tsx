import Link from 'next/link'
import { cn } from 'cn'

interface ActionLinkProps {
  label: string
  href?: string
  className?: string
}

export function ActionLink({ label, href, className }: ActionLinkProps) {
  const classes = cn(
    'flex h-11 shrink-0 cursor-pointer items-center justify-center px-3 text-sm font-bold',
    className,
  )

  if (href) {
    return (
      <Link href={href} className={classes}>
        {label}
      </Link>
    )
  }

  return (
    <button type="button" className={classes}>
      {label}
    </button>
  )
}
