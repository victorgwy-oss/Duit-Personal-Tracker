import { useEffect, type ReactNode } from 'react'
import { CloseIcon } from './icons'

interface SheetProps {
  open: boolean
  onClose: () => void
  title?: string
  children: ReactNode
  // Full-height sheet (for multi-step flows) vs auto-height bottom sheet.
  full?: boolean
}

// A bottom sheet that slides up from the bottom — the natural mobile pattern
// for quick actions and forms.
export default function Sheet({ open, onClose, title, children, full }: SheetProps) {
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose()
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [open, onClose])

  if (!open) return null

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        className={`w-full max-w-md rounded-t-3xl bg-ink-900 border-t border-x border-ink-800 shadow-2xl safe-bottom ${
          full ? 'h-[92vh]' : 'max-h-[92vh]'
        } flex flex-col`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between px-5 pt-4 pb-2 shrink-0">
          <div className="mx-auto absolute left-1/2 -translate-x-1/2 top-2 h-1.5 w-10 rounded-full bg-ink-700" />
          <h2 className="text-base font-semibold text-ink-100 pt-2">{title}</h2>
          <button
            onClick={onClose}
            className="p-2 -mr-2 text-ink-400 hover:text-ink-100 rounded-full"
            aria-label="Close"
          >
            <CloseIcon width={20} height={20} />
          </button>
        </div>
        <div className="overflow-y-auto px-5 pb-6 no-scrollbar flex-1">{children}</div>
      </div>
    </div>
  )
}
