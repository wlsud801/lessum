import { AppSidebar } from '@/components/layout/AppSidebar'

export default function TransactionsLoading() {
  return (
    <div className="flex min-h-screen flex-1">
      <AppSidebar active="transactions" />
      <main className="flex flex-1 flex-col gap-4 px-8 py-8">
        <p className="text-[13px] text-muted-foreground">Lessum / 거래 내역</p>
        <h1 className="text-[28px] font-bold">거래 내역</h1>
        <div
          className="flex flex-col items-center gap-2 py-16 text-muted-foreground"
          role="status"
        >
          <p className="text-[15px]">거래 내역을 불러오는 중입니다…</p>
        </div>
      </main>
    </div>
  )
}
