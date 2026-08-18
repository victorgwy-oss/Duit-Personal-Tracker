import { useEffect, useState } from 'react'
import Sheet from './Sheet'
import Keypad, { applyAmountKey } from './Keypad'

// A tappable amount field that opens the shared custom keypad in a bottom
// sheet, so every amount in the app is entered with the same 0 · . · ⌫ pad
// instead of the device's native keyboard.
export default function AmountField({
  value,
  onChange,
  currency = 'RM',
  placeholder = '0.00',
  compact = false,
  big = false,
  title = 'Enter amount',
  className,
}: {
  value: number
  onChange: (n: number) => void
  currency?: string
  placeholder?: string
  compact?: boolean
  big?: boolean
  title?: string
  className?: string
}) {
  const [open, setOpen] = useState(false)
  const shown = value ? value.toLocaleString('en-MY', { maximumFractionDigits: 2 }) : ''

  const base = compact
    ? 'flex items-center bg-ink-900 border border-ink-700 rounded-lg px-2.5 py-1.5'
    : 'w-full flex items-center gap-2 bg-ink-800 border border-ink-700 rounded-xl px-3 py-2.5'

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} className={`${base} ${className ?? ''}`}>
        <span className={`text-ink-500 ${compact ? 'text-xs mr-1' : 'text-sm'}`}>{currency}</span>
        <span
          className={`flex-1 tabular-nums ${compact ? 'text-right text-sm' : big ? 'text-lg font-semibold' : 'text-base'} ${
            shown ? 'text-ink-100' : 'text-ink-500'
          }`}
        >
          {shown || placeholder}
        </span>
      </button>
      <KeypadSheet
        open={open}
        onClose={() => setOpen(false)}
        title={title}
        currency={currency}
        value={value}
        onDone={(n) => {
          onChange(n)
          setOpen(false)
        }}
      />
    </>
  )
}

function KeypadSheet({
  open,
  onClose,
  title,
  currency,
  value,
  onDone,
}: {
  open: boolean
  onClose: () => void
  title: string
  currency: string
  value: number
  onDone: (n: number) => void
}) {
  const [amount, setAmount] = useState('')
  // Seed with the current value each time the pad opens.
  useEffect(() => {
    if (open) setAmount(value ? String(value) : '')
  }, [open, value])

  return (
    <Sheet open={open} onClose={onClose} title={title}>
      <div className="flex flex-col gap-5">
        <div className="text-center pt-1">
          <div className="text-5xl font-bold text-ink-100 tabular-nums">
            <span className="text-2xl text-ink-500 align-top mr-1">{currency}</span>
            {amount || '0'}
          </div>
        </div>
        <Keypad onPress={(k) => setAmount((p) => applyAmountKey(p, k))} />
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => setAmount('')}
            className="px-4 py-3 rounded-xl border border-ink-700 text-ink-400 text-sm"
          >
            Clear
          </button>
          <button
            type="button"
            onClick={() => onDone(parseFloat(amount || '0'))}
            className="flex-1 py-3 rounded-xl bg-brand-500 text-ink-950 font-semibold"
          >
            Done
          </button>
        </div>
      </div>
    </Sheet>
  )
}
