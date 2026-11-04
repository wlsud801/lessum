'use client'

import Link from 'next/link'
import { useMemo, useState } from 'react'
import { ChevronDown, ChevronLeft, ChevronRight, MoreVertical } from 'lucide-react'
import { cn } from 'cn'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { NativeSelect } from '@/components/ui/native-select'

import type { TransactionItem } from '@/lib/transactions/types'

interface TransactionsViewProps {
  monthLabel: string
  prevMonth: string
  nextMonth: string
  reviewCount: number
  transactions: TransactionItem[]
}

type TypeTab = 'all' | 'income' | 'expense' | 'transfer'
type StatusFilter = 'all' | 'review' | 'registered'
type SortKey = 'date' | 'kind' | 'merchant' | 'issuer' | 'amount' | 'status'

const TYPE_TABS: { id: TypeTab; label: string }[] = [
  { id: 'all', label: '전체' },
  { id: 'income', label: '수입' },
  { id: 'expense', label: '지출' },
  { id: 'transfer', label: '정산·이동' },
]

const KIND_LABELS: Record<TransactionItem['kind'], string> = {
  purchase_candidate: '카드 지출',
  refund: '환불',
  adjustment_reference: '조정',
}

const ISSUER_LABELS: Record<TransactionItem['issuer'], string> = {
  hyundai: '현대카드',
  lotte: '롯데카드',
  woori: '우리카드',
  samsung: '삼성카드',
}

const SORTABLE_HEADERS: { key: SortKey; label: string; width: string }[] = [
  { key: 'date', label: '날짜', width: 'w-[90px]' },
  { key: 'kind', label: '유형', width: 'w-[100px]' },
  { key: 'merchant', label: '거래처', width: 'w-[175px]' },
  { key: 'issuer', label: '카드·계좌', width: 'w-[185px]' },
  { key: 'amount', label: '금액', width: 'w-[140px]' },
]

const CELL_CLASS = 'px-2.5 py-2 text-sm'

function formatDate(row: TransactionItem) {
  if (!row.transaction_date) {
    return row.raw_date ?? '—'
  }
  const [, month, day] = row.transaction_date.split('-')
  return `${month}.${day}`
}

function formatAmount(row: TransactionItem) {
  if (row.amount_krw === null) {
    return '확인 필요'
  }
  return `${row.amount_krw.toLocaleString('ko-KR')}원`
}

function statusLabel(row: TransactionItem) {
  return row.requires_review ? '메일 · 확인 필요' : '메일 · 등록됨'
}

function sortValue(row: TransactionItem, key: SortKey): string | number {
  switch (key) {
    case 'date':
      return row.transaction_date ?? ''
    case 'kind':
      return KIND_LABELS[row.kind] ?? row.kind
    case 'merchant':
      return row.merchant ?? ''
    case 'issuer':
      return ISSUER_LABELS[row.issuer] ?? row.issuer
    case 'amount':
      return row.amount_krw ?? Number.NEGATIVE_INFINITY
    case 'status':
      return statusLabel(row)
  }
}

export function TransactionsView({
  monthLabel,
  prevMonth,
  nextMonth,
  reviewCount,
  transactions,
}: TransactionsViewProps) {
  const [typeTab, setTypeTab] = useState<TypeTab>('all')
  const [search, setSearch] = useState('')
  const [issuerFilter, setIssuerFilter] = useState('all')
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all')
  const [sortKey, setSortKey] = useState<SortKey>('date')
  const [sortAscending, setSortAscending] = useState(false)

  const issuers = useMemo(
    () => [...new Set(transactions.map((itRow) => itRow.issuer))],
    [transactions],
  )

  const rows = useMemo(() => {
    const keyword = search.trim().toLowerCase()
    const filtered = transactions.filter((itRow) => {
      if (typeTab === 'income' || typeTab === 'transfer') {
        return false
      }
      if (keyword && !(itRow.merchant ?? '').toLowerCase().includes(keyword)) {
        return false
      }
      if (issuerFilter !== 'all' && itRow.issuer !== issuerFilter) {
        return false
      }
      if (statusFilter === 'review' && !itRow.requires_review) {
        return false
      }
      if (statusFilter === 'registered' && itRow.requires_review) {
        return false
      }
      return true
    })

    return [...filtered].sort((a, b) => {
      const left = sortValue(a, sortKey)
      const right = sortValue(b, sortKey)
      const compared =
        typeof left === 'number' && typeof right === 'number'
          ? left - right
          : String(left).localeCompare(String(right), 'ko')
      return sortAscending ? compared : -compared
    })
  }, [transactions, typeTab, search, issuerFilter, statusFilter, sortKey, sortAscending])

  const handleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortAscending((prev) => !prev)
      return
    }
    setSortKey(key)
    setSortAscending(key !== 'date' && key !== 'amount')
  }

  const sortMark = (key: SortKey) => {
    if (sortKey !== key) {
      return '↕'
    }
    return sortAscending ? '↑' : '↓'
  }

  return (
    <div className="flex w-full max-w-[1160px] flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <div className="flex h-11 w-[250px] items-center justify-between rounded-lg border px-2">
          <Button
            variant="ghost"
            size="icon"
            aria-label="이전 달"
            nativeButton={false}
            render={<Link href={`/transactions?month=${prevMonth}`} />}
          >
            <ChevronLeft />
          </Button>
          <span className="text-[15px] font-bold">{monthLabel}</span>
          <Button
            variant="ghost"
            size="icon"
            aria-label="다음 달"
            nativeButton={false}
            render={<Link href={`/transactions?month=${nextMonth}`} />}
          >
            <ChevronRight />
          </Button>
        </div>
        <Button
          variant="outline"
          className="h-11 w-[180px] font-bold"
          disabled
          title="준비 중입니다"
        >
          가져오기
        </Button>
        <Button
          variant="outline"
          className="h-11 w-[180px] font-bold"
          disabled
          title="준비 중입니다"
        >
          내보내기
        </Button>
        <Button
          variant="outline"
          className="h-11 w-[190px] font-bold"
          onClick={() => setStatusFilter('review')}
        >
          확인할 내역 {reviewCount}
        </Button>
      </div>

      <div className="flex gap-2" role="tablist" aria-label="거래 유형 필터">
        {TYPE_TABS.map((itTab) => (
          <button
            key={itTab.id}
            type="button"
            role="tab"
            aria-selected={typeTab === itTab.id}
            onClick={() => setTypeTab(itTab.id)}
            className={cn(
              'h-10 flex-1 rounded-lg border px-2.5 text-left text-sm',
              typeTab === itTab.id
                ? 'bg-accent font-bold text-accent-foreground'
                : 'bg-background hover:bg-accent/50',
            )}
          >
            {itTab.label}
          </button>
        ))}
      </div>

      <div className="rounded-lg border bg-muted/40">
        <button
          type="button"
          disabled
          title="준비 중입니다"
          className="flex h-13 w-full cursor-not-allowed items-center justify-between px-4 py-3"
        >
          <span className="text-[15px] font-bold">거래 추가</span>
          <ChevronDown className="size-4 text-muted-foreground" />
        </button>
      </div>

      <h2 className="text-xl font-bold">거래 내역</h2>

      <div className="flex gap-3">
        <div className="flex flex-1 flex-col gap-1.5">
          <Label htmlFor="merchantSearch" className="font-bold">
            거래처 검색
          </Label>
          <Input
            id="merchantSearch"
            placeholder="거래처를 검색하세요"
            className="h-11"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>
        <div className="flex flex-1 flex-col gap-1.5">
          <Label htmlFor="categoryFilter" className="font-bold">
            카테고리
          </Label>
          <NativeSelect
            id="categoryFilter"
            className="h-11"
            disabled
            title="준비 중입니다"
          >
            <option value="all">전체</option>
          </NativeSelect>
        </div>
        <div className="flex flex-1 flex-col gap-1.5">
          <Label htmlFor="issuerFilter" className="font-bold">
            카드·계좌
          </Label>
          <NativeSelect
            id="issuerFilter"
            className="h-11"
            value={issuerFilter}
            onChange={(event) => setIssuerFilter(event.target.value)}
          >
            <option value="all">전체</option>
            {issuers.map((itIssuer) => (
              <option key={itIssuer} value={itIssuer}>
                {ISSUER_LABELS[itIssuer] ?? itIssuer}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="flex flex-1 flex-col gap-1.5">
          <Label htmlFor="statusFilter" className="font-bold">
            확인 상태
          </Label>
          <NativeSelect
            id="statusFilter"
            className="h-11"
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value as StatusFilter)}
          >
            <option value="all">전체</option>
            <option value="review">확인 필요</option>
            <option value="registered">등록됨</option>
          </NativeSelect>
        </div>
      </div>

      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full min-w-[1024px] table-fixed border-collapse text-left">
          <caption className="sr-only">월별 거래 내역 목록</caption>
          <colgroup>
            <col className="w-[90px]" />
            <col className="w-[100px]" />
            <col className="w-[175px]" />
            <col className="w-[185px]" />
            <col className="w-[140px]" />
            <col className="w-[100px]" />
            <col className="w-[154px]" />
            <col className="w-[90px]" />
            <col className="w-[66px]" />
          </colgroup>
          <thead className="bg-muted text-[12px] font-bold">
            <tr>
              {SORTABLE_HEADERS.map((itHeader) => (
                <th key={itHeader.key} scope="col" className="p-0">
                  <button
                    type="button"
                    onClick={() => handleSort(itHeader.key)}
                    className={cn(
                      'w-full px-2.5 py-1.5 text-left font-bold hover:bg-accent',
                      sortKey === itHeader.key && 'bg-accent',
                    )}
                  >
                    {itHeader.label} {sortMark(itHeader.key)}
                  </button>
                </th>
              ))}
              <th scope="col" className="px-2.5 py-1.5">
                분류
              </th>
              <th scope="col" className="p-0">
                <button
                  type="button"
                  onClick={() => handleSort('status')}
                  className={cn(
                    'w-full px-2.5 py-1.5 text-left font-bold hover:bg-accent',
                    sortKey === 'status' && 'bg-accent',
                  )}
                >
                  출처 / 상태 {sortMark('status')}
                </button>
              </th>
              <th scope="col" className="px-2.5 py-1.5">
                정기거래
              </th>
              <th scope="col" className="px-2.5 py-1.5">
                <span className="sr-only">행 작업</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td
                  colSpan={9}
                  className="px-2.5 py-10 text-center text-sm text-muted-foreground"
                >
                  표시할 거래가 없습니다.
                </td>
              </tr>
            ) : (
              rows.map((itRow) => (
                <tr key={itRow.id} className="border-t">
                  <td className={CELL_CLASS}>{formatDate(itRow)}</td>
                  <td className={CELL_CLASS}>{KIND_LABELS[itRow.kind] ?? itRow.kind}</td>
                  <td className={cn(CELL_CLASS, 'truncate')}>
                    {itRow.merchant ?? '—'}
                  </td>
                  <td className={CELL_CLASS}>
                    {ISSUER_LABELS[itRow.issuer] ?? itRow.issuer}
                  </td>
                  <td
                    className={cn(
                      CELL_CLASS,
                      itRow.amount_krw === null && 'text-muted-foreground',
                    )}
                  >
                    {formatAmount(itRow)}
                  </td>
                  <td className={CELL_CLASS}>미분류</td>
                  <td
                    className={CELL_CLASS}
                    title={itRow.review_reasons.join(', ') || undefined}
                  >
                    {statusLabel(itRow)}
                  </td>
                  <td className={cn(CELL_CLASS, 'text-center')}>—</td>
                  <td className="px-2.5 py-1.5 text-center">
                    <Button
                      variant="outline"
                      size="icon"
                      disabled
                      title="준비 중입니다"
                      aria-label="행 작업 열기"
                    >
                      <MoreVertical />
                    </Button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  )
}
