'use client'

import { useState } from 'react'
import { MoreVertical } from 'lucide-react'

import { Button } from '@/components/ui/button'

interface TransactionRowActionsProps {
  onEdit: () => void
  onDelete: () => void
}

export function TransactionRowActions({
  onEdit,
  onDelete,
}: TransactionRowActionsProps) {
  const [isOpen, setIsOpen] = useState(false)

  const handleSelect = (action: () => void) => {
    setIsOpen(false)
    action()
  }

  return (
    <div className="relative inline-block">
      <Button
        variant="outline"
        size="icon"
        aria-label="행 작업 열기"
        aria-expanded={isOpen}
        onClick={() => setIsOpen((prev) => !prev)}
      >
        <MoreVertical />
      </Button>

      {isOpen && (
        <>
          <button
            type="button"
            aria-label="행 작업 닫기"
            className="fixed inset-0 z-10 cursor-default"
            onClick={() => setIsOpen(false)}
          />
          <div className="absolute right-0 z-20 mt-1 flex w-28 flex-col rounded-lg border bg-popover p-1 shadow-md">
            <button
              type="button"
              className="rounded-md px-3 py-2 text-left text-sm hover:bg-accent"
              onClick={() => handleSelect(onEdit)}
            >
              수정
            </button>
            <button
              type="button"
              className="rounded-md px-3 py-2 text-left text-sm text-destructive hover:bg-accent"
              onClick={() => handleSelect(onDelete)}
            >
              삭제
            </button>
          </div>
        </>
      )}
    </div>
  )
}
