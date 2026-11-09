import { connection } from 'next/server'

import { TransactionsView } from '@/components/transactions/TransactionsView'
import { getMe } from '@/lib/auth/api'
import { getPaymentMethods, getTransactions } from '@/lib/transactions/api'

interface TransactionsPageProps {
  searchParams: Promise<{ month?: string }>
}

const MONTH_PATTERN = /^\d{4}-(0[1-9]|1[0-2])$/

function currentMonth(timezone: string) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
  }).format(new Date())
}

function shiftMonth(month: string, diff: number) {
  const [year, monthNumber] = month.split('-').map(Number)
  const shifted = new Date(Date.UTC(year, monthNumber - 1 + diff, 1))
  return `${shifted.getUTCFullYear()}-${String(shifted.getUTCMonth() + 1).padStart(2, '0')}`
}

function monthLabel(month: string) {
  const [year, monthNumber] = month.split('-').map(Number)
  return `${year}년 ${monthNumber}월`
}

export default async function TransactionsPage({
  searchParams,
}: TransactionsPageProps) {
  await connection()

  const { month: monthParam } = await searchParams
  const me = await getMe()

  const timezone = me?.profile.timezone ?? 'Asia/Seoul'
  const month =
    monthParam && MONTH_PATTERN.test(monthParam)
      ? monthParam
      : currentMonth(timezone)

  const [data, paymentMethods] = await Promise.all([
    getTransactions(month),
    getPaymentMethods(),
  ])

  return (
    <div className="flex flex-1 flex-col gap-4">
      <p className="text-[13px] text-muted-foreground">Lessum / 거래 내역</p>
      <h1 className="text-[28px] font-bold">거래 내역</h1>
      <TransactionsView
        monthLabel={monthLabel(month)}
        prevMonth={shiftMonth(month, -1)}
        nextMonth={shiftMonth(month, 1)}
        reviewCount={data?.review_count ?? 0}
        transactions={data?.transactions ?? []}
        paymentMethods={paymentMethods}
      />
    </div>
  )
}
