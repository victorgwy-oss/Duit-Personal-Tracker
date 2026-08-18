import { useEffect, useState } from 'react'
import Sheet from '../components/Sheet'
import Keypad, { applyAmountKey } from '../components/Keypad'
import { useAccounts, useCategories } from '../hooks/useData'
import { addTransaction } from '../lib/repo'
import { todayISO, formatShortDate } from '../lib/format'
import type { Account, Category } from '../lib/types'

interface Props {
  open: boolean
  onClose: () => void
  // Optional prefill (used by the receipt scanner).
  prefill?: Partial<{ amount: number; note: string; categoryId: string; accountId: string; date: string }>
}

export default function QuickAdd({ open, onClose, prefill }: Props) {
  const accounts = useAccounts()
  const categories = useCategories()

  const [amount, setAmount] = useState('')
  const [accountId, setAccountId] = useState<string>('')
  const [categoryId, setCategoryId] = useState<string>('')
  const [note, setNote] = useState('')
  const [date, setDate] = useState(todayISO())
  const [saving, setSaving] = useState(false)

  // Initialise defaults when the sheet opens.
  useEffect(() => {
    if (!open) return
    setAmount(prefill?.amount ? String(prefill.amount) : '')
    setNote(prefill?.note ?? '')
    setDate(prefill?.date ?? todayISO())
    setAccountId(prefill?.accountId ?? accounts?.[0]?.id ?? '')
    setCategoryId(prefill?.categoryId ?? categories?.[0]?.id ?? '')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  useEffect(() => {
    if (open && !accountId && accounts?.[0]) setAccountId(accounts[0].id)
    if (open && !categoryId && categories?.[0]) setCategoryId(categories[0].id)
  }, [open, accounts, categories, accountId, categoryId])

  const value = parseFloat(amount || '0')
  const canSave = value > 0 && accountId && categoryId && !saving

  function press(key: string) {
    setAmount((prev) => applyAmountKey(prev, key))
  }

  async function save() {
    if (!canSave) return
    setSaving(true)
    try {
      await addTransaction({
        date,
        amount: value,
        accountId,
        categoryId,
        note: note.trim(),
        source: 'manual',
      })
      onClose()
    } finally {
      setSaving(false)
    }
  }

  return (
    <Sheet open={open} onClose={onClose} title="Add expense" full>
      <div className="flex flex-col gap-5">
        {/* Amount display */}
        <div className="text-center pt-2">
          <div className="text-ink-500 text-sm mb-1">Amount</div>
          <div className="text-5xl font-bold text-ink-100 tabular-nums">
            <span className="text-2xl text-ink-500 align-top mr-1">RM</span>
            {amount || '0'}
          </div>
        </div>

        {/* Wallet toggle */}
        <WalletPicker accounts={accounts} value={accountId} onChange={setAccountId} />

        {/* Category chips */}
        <CategoryPicker categories={categories} value={categoryId} onChange={setCategoryId} />

        {/* Note + date */}
        <div className="flex gap-2">
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            placeholder="Note (optional)"
            className="flex-1 bg-ink-800 border border-ink-700 rounded-xl px-3 py-2.5 text-sm text-ink-100 placeholder:text-ink-500 focus:outline-none focus:border-brand-500"
          />
          <label className="relative bg-ink-800 border border-ink-700 rounded-xl px-3 py-2.5 text-sm text-ink-300 flex items-center gap-2 cursor-pointer">
            {date === todayISO() ? 'Today' : formatShortDate(date)}
            <input
              type="date"
              value={date}
              max={todayISO()}
              onChange={(e) => setDate(e.target.value || todayISO())}
              className="absolute inset-0 opacity-0 cursor-pointer"
            />
          </label>
        </div>

        {/* Number pad */}
        <Keypad onPress={press} />

        <button
          onClick={save}
          disabled={!canSave}
          className="w-full py-4 rounded-2xl bg-brand-500 text-ink-950 font-semibold text-lg disabled:opacity-40 disabled:cursor-not-allowed active:scale-[0.99] transition"
        >
          {saving ? 'Saving…' : 'Save expense'}
        </button>
      </div>
    </Sheet>
  )
}

function WalletPicker({
  accounts,
  value,
  onChange,
}: {
  accounts: Account[] | undefined
  value: string
  onChange: (id: string) => void
}) {
  return (
    <div className="grid grid-cols-2 gap-2">
      {(accounts ?? []).map((a) => {
        const active = a.id === value
        return (
          <button
            key={a.id}
            onClick={() => onChange(a.id)}
            className={`py-3 rounded-xl border text-sm font-medium flex items-center justify-center gap-2 transition ${
              active
                ? 'border-transparent text-ink-950'
                : 'border-ink-700 text-ink-300 bg-ink-800'
            }`}
            style={active ? { backgroundColor: a.color } : undefined}
          >
            <span
              className="h-2.5 w-2.5 rounded-full"
              style={{ backgroundColor: active ? '#00000055' : a.color }}
            />
            {a.name}
          </button>
        )
      })}
    </div>
  )
}

function CategoryPicker({
  categories,
  value,
  onChange,
}: {
  categories: Category[] | undefined
  value: string
  onChange: (id: string) => void
}) {
  return (
    <div className="flex gap-2 overflow-x-auto no-scrollbar -mx-5 px-5 py-1">
      {(categories ?? []).map((c) => {
        const active = c.id === value
        return (
          <button
            key={c.id}
            onClick={() => onChange(c.id)}
            className={`shrink-0 px-3 py-2 rounded-full border text-sm flex items-center gap-1.5 transition ${
              active ? 'border-brand-500 bg-brand-500/15 text-brand-400' : 'border-ink-700 bg-ink-800 text-ink-300'
            }`}
          >
            <span>{c.icon}</span>
            {c.name}
          </button>
        )
      })}
    </div>
  )
}

