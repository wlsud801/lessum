interface NoticeBoxProps {
  title?: string
  lines: string[]
}

export function NoticeBox({ title = '안내', lines }: NoticeBoxProps) {
  return (
    <section className="flex flex-col gap-2 rounded-lg border bg-muted p-5">
      <h2 className="text-[17px] font-bold">{title}</h2>
      <div className="flex flex-col text-[15px] text-muted-foreground">
        {lines.map((line) => (
          <p key={line}>{line}</p>
        ))}
      </div>
    </section>
  )
}
