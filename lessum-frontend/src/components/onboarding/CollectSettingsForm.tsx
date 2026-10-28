'use client'

import Link from 'next/link'
import { useState } from 'react'

import { NoticeBox } from '@/components/onboarding/NoticeBox'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { NativeSelect } from '@/components/ui/native-select'

interface CardSetting {
  id: string
  name: string
  isSupported: boolean
  arrivalDay: string
  nextCollectDate: string
}

const MAILBOXES = ['카드명세서', 'INBOX']
const ARRIVAL_DAYS = [
  ...Array.from({ length: 31 }, (_, index) => ({
    value: String(index + 1),
    label: `매월 ${index + 1}일`,
  })),
  { value: 'last', label: '매월 말일' },
]

const DUMMY_CARDS: CardSetting[] = [
  { id: 'hyundai', name: '현대', isSupported: true, arrivalDay: '25', nextCollectDate: '2026.10.25' },
  { id: 'lotte', name: '롯데', isSupported: true, arrivalDay: '20', nextCollectDate: '2026.11.20' },
  { id: 'woori', name: '우리', isSupported: true, arrivalDay: '26', nextCollectDate: '2026.10.26' },
  { id: 'samsung', name: '삼성', isSupported: true, arrivalDay: 'last', nextCollectDate: '2026.10.31' },
  { id: 'shinhan', name: '신한', isSupported: false, arrivalDay: '', nextCollectDate: '' },
]

const CELL_CLASS = 'px-2.5 py-1.5 text-sm'

export function CollectSettingsForm() {
  const [mailbox, setMailbox] = useState(MAILBOXES[0])
  const [startDate, setStartDate] = useState('2026.10.01')
  const [cards, setCards] = useState(DUMMY_CARDS)
  const [selectedIds, setSelectedIds] = useState<string[]>(
    DUMMY_CARDS.filter((card) => card.isSupported).map((card) => card.id),
  )
  const [statementPassword, setStatementPassword] = useState('')

  const handleToggleCard = (id: string, checked: boolean) => {
    setSelectedIds((prev) =>
      checked ? [...prev, id] : prev.filter((itRow) => itRow !== id),
    )
  }

  const handleChangeArrivalDay = (id: string, arrivalDay: string) => {
    // TODO : 도착 예정일에 맞춰 다음 자동 조회일 재계산
    setCards((prev) =>
      prev.map((card) => (card.id === id ? { ...card, arrivalDay } : card)),
    )
  }

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    // TODO : 수집 설정 저장 API 호출 후 자동 등록 단계로 이동
  }

  return (
    <form onSubmit={handleSubmit} noValidate className="flex flex-col gap-4">
      <NoticeBox lines={['메일 연결 성공 · example@naver.com']} />
      <div className="flex gap-3">
        <div className="flex flex-1 flex-col gap-1.5">
          <Label htmlFor="mailbox" className="font-bold">
            수집할 메일함 *
          </Label>
          <NativeSelect
            id="mailbox"
            name="mailbox"
            className="h-11"
            value={mailbox}
            onChange={(event) => setMailbox(event.target.value)}
          >
            {MAILBOXES.map((itRow) => (
              <option key={itRow} value={itRow}>
                {itRow}
              </option>
            ))}
          </NativeSelect>
        </div>
        <div className="flex flex-1 flex-col gap-1.5">
          <Label htmlFor="startDate" className="font-bold">
            가져오기 시작일 *
          </Label>
          <Input
            id="startDate"
            name="startDate"
            placeholder="2026.10.01"
            className="h-11"
            value={startDate}
            onChange={(event) => setStartDate(event.target.value)}
          />
        </div>
      </div>
      <p className="text-[13px]">
        접속한 메일 서버에서 조회한 실제 메일함 중 선택합니다.
      </p>
      <h2 className="text-lg font-bold">
        카드사와 명세서 도착 예정일을 선택해주세요.
      </h2>
      <div className="overflow-x-auto rounded-lg border">
        <table className="w-full min-w-[640px] table-fixed border-collapse text-left">
          <caption className="sr-only">카드별 명세서 도착일 설정</caption>
          <colgroup>
            <col className="w-[60px]" />
            <col className="w-[180px]" />
            <col className="w-[240px]" />
            <col />
          </colgroup>
          <thead className="bg-muted text-[13px] font-bold">
            <tr>
              <th scope="col" className={CELL_CLASS}>선택</th>
              <th scope="col" className={CELL_CLASS}>카드사 / 명세서</th>
              <th scope="col" className={CELL_CLASS}>명세서 도착 예정일 *</th>
              <th scope="col" className={CELL_CLASS}>다음 자동 조회</th>
            </tr>
          </thead>
          <tbody>
            {cards.map((card) => {
              const isSelected = selectedIds.includes(card.id)
              return (
                <tr key={card.id} className="align-top">
                  <td className={CELL_CLASS}>
                    {card.isSupported ? (
                      <Checkbox
                        aria-label={`${card.name} 선택`}
                        checked={isSelected}
                        onCheckedChange={(checked) =>
                          handleToggleCard(card.id, checked)
                        }
                      />
                    ) : (
                      '—'
                    )}
                  </td>
                  <td className={CELL_CLASS}>{card.name}</td>
                  <td className={CELL_CLASS}>
                    {card.isSupported ? (
                      <NativeSelect
                        aria-label={`${card.name} 도착 예정일`}
                        className="h-11"
                        value={card.arrivalDay}
                        disabled={!isSelected}
                        onChange={(event) =>
                          handleChangeArrivalDay(card.id, event.target.value)
                        }
                      >
                        {ARRIVAL_DAYS.map((itDay) => (
                          <option key={itDay.value} value={itDay.value}>
                            {itDay.label}
                          </option>
                        ))}
                      </NativeSelect>
                    ) : (
                      '현재 미지원'
                    )}
                  </td>
                  <td className={CELL_CLASS}>
                    {card.isSupported && isSelected ? card.nextCollectDate : '—'}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <NoticeBox
        lines={[
          '매월 설정한 날짜에 메일을 조회해 명세서를 등록합니다.',
          '도착일은 1~31일 또는 말일로 선택합니다. 해당 날짜가 없는 달은 말일에 조회합니다.',
        ]}
      />
      <div className="flex flex-col gap-1.5">
        <Label htmlFor="statementPassword" className="font-bold">
          선택한 카드의 명세서 암호 (필요한 경우)
        </Label>
        <Input
          id="statementPassword"
          name="statementPassword"
          type="password"
          autoComplete="off"
          placeholder="삼성 명세서 열기 암호 · 새 입력"
          className="h-11"
          value={statementPassword}
          onChange={(event) => setStatementPassword(event.target.value)}
        />
        <p className="text-xs text-muted-foreground">
          메일 앱 비밀번호와 다른 암호입니다. 필요한 카드에만 입력받습니다.
        </p>
      </div>
      <div className="flex gap-3">
        <Button
          variant="outline"
          className="h-11 w-[150px] font-bold"
          nativeButton={false}
          render={<Link href="/onboarding/mail" />}
        >
          이전
        </Button>
        <Button
          type="submit"
          className="h-11 w-[300px] font-bold"
          disabled={selectedIds.length === 0}
        >
          자동 등록 설정으로
        </Button>
      </div>
    </form>
  )
}
