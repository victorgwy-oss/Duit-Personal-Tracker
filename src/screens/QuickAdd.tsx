import { useEffect, useMemo, useState } from 'react'
import Sheet from '../components/Sheet'
import Keypad, { applyAmountKey } from '../components/Keypad'
import {
  useAccounts,
  useAllTransactions,
  useCategories,
  useIncomeOverrides,
  useIncomePayments,
  useIncomeSources,
  useSettings,
} from '../hooks/useData'
import { addIncomePayment, addTransaction, setIncomeOverride } from '../lib/repo'
import { orderCategoriesByUsage } from '../lib/categories'
import { orderAccountsByUsage } from '../lib/wallets'
import { resolveIncome } from '../lib/income'
import { getCycle, cycleStartISO, cycleEndISO } from '../lib/cycle'
import { todayISO, formatShortDate, formatMoney, fromISO } from '../lib/format'
import type { Account, Category, IncomeSource } from '../lib/types'

interface Props {
  open: boolean
  onClose: () => void
  // Optional prefill (used by the receipt scanner).
  prefill?: Partial<{ amount: number; note: string; categoryId: string; accountId: string; date: string }>
}

type Kind = 'expense' | 'income'

export default function QuickAdd({ open, onClose, prefill }: Props) {
  const accounts = useAccounts()
  const categories = useCategories()
  const incomeSources = useIncomeSources()
  const txns = useAllTransactions()
  const orderedCategories = useMemo(
    () => orderCategoriesByUsage(categories ?? [], txns),
    [categories, txns],
  )
  const orderedAccounts = useMemo(() => orderAccountsByUsage(accounts ?? [], txns), [accounts, txns])
  // Payment-logged streams (business) first — those are what you log here.
  const orderedSources = useMemo(
    () =>
      (incomeSources ?? [])
        .filter((s) => s.active)
        .sort((a, b) => Number(!!b.trackPayments) - Number(!!a.trackPayments) || a.name.localeCompare(b.name)),
    [incomeSources],
  )

  const [kind, setKind] = useState<Kind>('expense')
  const [amount, setAmount] = useState('')
  const [accountId, setAccountId] = useState<string>('')
  const [categoryId, setCategoryId] = useState<string>('')
  const [sourceId, setSourceId] = useState<string>('')
  const [note, setNote] = useState('')
  const [date, setDate] = useState(todayISO())
  const [saving, setSaving] = useState(false)

  // Initialise defaults when the sheet opens. Always start on Expense (the
  // common case); the receipt scanner's prefill is an expense too.
  useEffect(() => {
    if (!open) return
    setKind('expense')
    setAmount(prefill?.amount ? String(prefill.amount) : '')
    setNote(prefill?.note ?? '')
    setDate(prefill?.date ?? todayISO())
    setAccountId(prefill?.accountId ?? orderedAccounts[0]?.id ?? '')
    setCategoryId(prefill?.categoryId ?? orderedCategories[0]?.id ?? '')
    setSourceId(orderedSources[0]?.id ?? '')
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  useEffect(() => {
    if (open && !accountId && orderedAccounts[0]) setAccountId(orderedAccounts[0].id)
    if (open && !categoryId && orderedCategories[0]) setCategoryId(orderedCategories[0].id)
    if (open && !sourceId && orderedSources[0]) setSourceId(orderedSources[0].id)
  }, [open, orderedAccounts, orderedCategories, orderedSources, accountId, categoryId, sourceId])

  // Income: payment-logged streams (business) get a payment ADDED; fixed
  // streams (salary, rent) get the month's amount SET — adding a "payment" to
  // a fixed stream would double-count its regular amount.
  const settings = useSettings()
  const overrides = useIncomeOverrides()
  const incomePayments = useIncomePayments()
  const source = orderedSources.find((s) => s.id === sourceId)
  const addsPayment = !!source?.trackPayments
  const cycle = getCycle(settings?.cycleStartDay ?? 1, fromISO(date))
  const monthName = cycle.label.split(' ')[0]
  const currentForSource = source
    ? resolveIncome([source], overrides ?? [], cycle.key, incomePayments ?? [], {
        start: cycleStartISO(cycle),
        end: cycleEndISO(cycle),
      }).total
    : 0

  const value = parseFloat(amount || '0')
  const canSave =
    value > 0 && !saving && (kind === 'expense' ? !!accountId && !!categoryId : !!sourceId)

  function press(key: string) {
    setAmount((prev) => applyAmountKey(prev, key))
  }

  async function save() {
    if (!canSave) return
    setSaving(true)
    try {
      if (kind === 'expense') {
        await addTransaction({
          date,
          amount: value,
          accountId,
          categoryId,
          note: note.trim(),
          source: 'manual',
        })
      } else if (addsPayment) {
        await addIncomePayment({ sourceId, date, amount: value, note })
      } else {
        await setIncomeOverride(sourceId, cycle.key, value)
      }
      onClose()
    } finally {
      setSaving(false)
    }
  }

  return (
    <Sheet open={open} onClose={onClose} title={kind === 'expense' ? 'Add expense' : 'Add income'} full>
      <div className="flex flex-col gap-5">
        {/* Expense / Income switch */}
        <div className="grid grid-cols-2 gap-2 p-1 rounded-xl bg-ink-800">
          {(['expense', 'income'] as const).map((k) => (
            <button
              key={k}
              onClick={() => setKind(k)}
              className={`py-2 rounded-lg text-sm font-medium capitalize transition ${
                kind === k ? (k === 'income' ? 'bg-good text-ink-950' : 'bg-brand-500 text-ink-950') : 'text-ink-400'
              }`}
            >
              {k}
            </button>
          ))}
        </div>

        {/* Amount display */}
        <div className="text-center">
          <div className="text-ink-500 text-sm mb-1">
            {kind === 'expense' ? 'Amount' : addsPayment ? 'Payment received' : `Amount for ${monthName}`}
          </div>
          <div className={`text-5xl font-bold tabular-nums ${kind === 'income' ? 'text-good' : 'text-ink-100'}`}>
            <span className="text-2xl text-ink-500 align-top mr-1">RM</span>
            {amount || '0'}
          </div>
        </div>

        {kind === 'expense' ? (
          <>
            {/* Wallet toggle */}
            <WalletPicker accounts={orderedAccounts} value={accountId} onChange={setAccountId} />

            {/* Category chips */}
            <CategoryPicker categories={orderedCategories} value={categoryId} onChange={setCategoryId} />
          </>
        ) : (
          <div>
            <SourcePicker sources={orderedSources} value={sourceId} onChange={setSourceId} />
            {source && (
              <p className="text-xs text-ink-500 mt-2 text-center">
                {addsPayment
                  ? `Adds a payment to ${source.name} for ${monthName} · ${formatMoney(currentForSource)} so far`
                  : `Sets ${source.name} for ${monthName} · currently ${formatMoney(currentForSource)}`}
              </p>
            )}
          </div>
        )}

        {/* Note + date. A fixed income stream stores one amount per month, so
            it has no note — the date just picks the month. */}
        <div className="flex gap-2">
          {(kind === 'expense' || addsPayment) && (
            <input
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder={kind === 'expense' ? 'Note (optional)' : 'Client / invoice (optional)'}
              className="flex-1 min-w-0 bg-ink-800 border border-ink-700 rounded-xl px-3 py-2.5 text-sm text-ink-100 placeholder:text-ink-500 focus:outline-none focus:border-brand-500"
            />
          )}
          {/* overflow-hidden keeps the invisible date input inside this pill.
              A mobile browser can size a date input wider than "Today" (narrow
              screens, enlarged system text), letting it poke past the screen
              edge; the sheet body is also locked to vertical scroll. */}
          <label
            className={`relative overflow-hidden bg-ink-800 border border-ink-700 rounded-xl px-3 py-2.5 text-sm text-ink-300 flex items-center gap-2 cursor-pointer shrink-0 ${
              kind === 'income' && !addsPayment ? 'flex-1 justify-between' : ''
            }`}
          >
            {kind === 'income' && !addsPayment ? (
              <>
                <span className="text-ink-500">Month</span>
                <span>{cycle.label}</span>
              </>
            ) : date === todayISO() ? (
              'Today'
            ) : (
              formatShortDate(date)
            )}
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
          {saving
            ? 'Saving…'
            : kind === 'expense'
              ? 'Save expense'
              : addsPayment
                ? 'Save income'
                : `Set for ${monthName}`}
        </button>
      </div>
    </Sheet>
  )
}

function SourcePicker({
  sources,
  value,
  onChange,
}: {
  sources: IncomeSource[]
  value: string
  onChange: (id: string) => void
}) {
  if (sources.length === 0) {
    return (
      <p className="text-sm text-ink-500 text-center">
        No income streams yet — add one under Settings → Income streams.
      </p>
    )
  }
  return (
    <div className="flex gap-2 overflow-x-auto no-scrollbar -mx-5 px-5 py-1">
      {sources.map((s) => {
        const active = s.id === value
        return (
          <button
            key={s.id}
            onClick={() => onChange(s.id)}
            className={`shrink-0 px-3 py-2 rounded-full border text-sm flex items-center gap-1.5 transition ${
              active ? 'border-good bg-good/15 text-good' : 'border-ink-700 bg-ink-800 text-ink-300'
            }`}
          >
            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: s.color }} />
            {s.name}
          </button>
        )
      })}
    </div>
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

