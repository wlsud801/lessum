interface SettingsMenuRowProps {
  title: string
  description: string
  action: string
}

export function SettingsMenuRow({
  title,
  description,
  action,
}: SettingsMenuRowProps) {
  return (
    <div className="flex items-center justify-between gap-6 px-6 py-6">
      <div className="flex flex-col gap-1">
        <p className="text-[17px] font-bold">{title}</p>
        <p className="text-sm text-muted-foreground">{description}</p>
      </div>
      <p className="shrink-0 text-[15px] font-bold">{action}</p>
    </div>
  )
}
