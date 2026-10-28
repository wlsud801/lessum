import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'

interface AuthCardProps {
  title: string
  children: React.ReactNode
}

export function AuthCard({ title, children }: AuthCardProps) {
  return (
    <main className="flex flex-1 items-start justify-center px-4 pt-[90px]">
      <Card className="w-full max-w-[520px]">
        <CardHeader>
          <p className="text-lg font-bold">Lessum</p>
          <CardTitle className="text-3xl font-bold">{title}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">{children}</CardContent>
      </Card>
    </main>
  )
}
