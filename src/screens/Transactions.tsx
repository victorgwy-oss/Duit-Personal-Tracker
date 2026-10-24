import { useEffect, useMemo, useRef, useState } from 'react'
import {
  useAllTransactions,
  useAssets,
  useIncomePayments,
  useIncomeSources,
  useLookups,
  useSettings,
} from '../hooks/useData'
import { formatMoney, formatDayLabel, formatTime, todayISO } from '../lib/format'
import { winsBetween, type Win } from '../lib/wins'
import type { Account, Category, Transaction } from '../lib/types'
import { CloseIcon, ChevronLeft, ChevronRight } from '../components/icons'
import EditTransaction from './EditTransaction'

interface DayGroup {
  date: string
  items: Transaction[]
  wins: Win[]
  total: number // spending
  income: number // wins (money in + automatic investing)
}

export default function TransactionsScreen() {
  const txns = useAllTransactions()
  const settings = useSettings()
  const payments = useIncomePayments()
  const sources = useIncomeSources()
  const assets = useAssets()
  const { accounts, categories, accountMap, categoryMap } = useLookups()
  const [editing, setEditing] = useState<Transaction | null>(null)
  const [filter, setFilter] = useState('')
  const [view, setView] = useState<'list' | 'calendar'>('list')

  // Wins sit alongside expenses, so looking back isn't only a list of losses.
  const allWins = useMemo(
    () => winsBetween('0000-01-01', todayISO(), payments ?? [], sources ?? [], assets ?? []),
    [payments, sources, assets],
  )

  const grouped = useMemo(() => {
    const q = filter.toLowerCase()
    const list = (txns ?? [])
      .filter((t) => {
        if (!q) return true
        const cat = categoryMap.get(t.categoryId)?.name ?? ''
        const acc = accountMap.get(t.accountId)?.name ?? ''
        return (t.note + ' ' + cat + ' ' + acc).toLowerCase().includes(q)
      })
      .sort((a, b) => (b.date === a.date ? b.createdAt - a.createdAt : b.date.localeCompare(a.date)))
    const byDate = new Map<string, DayGroup>()
    const groupFor = (date: string) => {
      let g = byDate.get(date)
      if (!g) {
        g = { date, items: [], wins: [], total: 0, income: 0 }
        byDate.set(date, g)
      }
      return g
    }
    for (const t of list) {
      const g = groupFor(t.date)
      g.items.push(t)
      g.total += t.amount
    }
    for (const w of allWins) {
      if (q && !(w.title + ' ' + w.subtitle).toLowerCase().includes(q)) continue
      const g = groupFor(w.date)
      g.wins.push(w)
      g.income += w.amount
    }
    return [...byDate.values()].sort((a, b) => b.date.localeCompare(a.date))
  }, [txns, filter, categoryMap, accountMap, allWins])

  const currency = settings?.currency ?? 'RM'

  return (
    <div className="px-5 pt-6 safe-top">
      <h1 className="text-2xl font-bold text-ink-100 mb-4">Activity</h1>

      <div className="flex gap-2 mb-4">
        {(['list', 'calendar'] as const).map((v) => (
          <button
            key={v}
            onClick={() => setView(v)}
            className={`flex-1 py-2 rounded-lg text-sm capitalize ${
              view === v ? 'bg-brand-500 text-ink-950 font-medium' : 'bg-ink-800 text-ink-300'
            }`}
          >
            {v}
          </button>
        ))}
      </div>

      {view === 'list' ? (
        <>
          <SearchBox
            value={filter}
            onChange={setFilter}
            categories={categories}
            accounts={accounts}
            txns={txns}
          />

          {grouped.length === 0 && (
            <div className="text-center text-ink-500 py-16">
              <p className="text-4xl mb-3">🧾</p>
              <p>No expenses yet.</p>
              <p className="text-sm mt-1">Tap the + button to log your first one.</p>
            </div>
          )}

          <div className="space-y-6">
            {grouped.map((g) => (
              <div key={g.date}>
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-medium text-ink-400">{formatDayLabel(g.date)}</span>
                  <DayTotals spent={g.items.length > 0 ? g.total : null} income={g.income} currency={currency} />
                </div>
                <div className="space-y-1">
                  {g.wins.map((w) => (
                    <WinRow key={w.id} w={w} currency={currency} />
                  ))}
                  {g.items.map((t) => (
                    <TxnRow
                      key={t.id}
                      t={t}
                      categoryMap={categoryMap}
                      accountMap={accountMap}
                      currency={currency}
                      onClick={() => setEditing(t)}
                    />
                  ))}
                </div>
              </div>
            ))}
          </div>
        </>
      ) : (
        <CalendarView
          txns={txns}
          wins={allWins}
          categoryMap={categoryMap}
          accountMap={accountMap}
          currency={currency}
          onEdit={setEditing}
        />
      )}

      <EditTransaction txn={editing} onClose={() => setEditing(null)} />
    </div>
  )
}

function DayTotals({ spent, income, currency }: { spent: number | null; income: number; currency: string }) {
  return (
    <span className="text-xs tabular-nums flex items-center gap-2">
      {income > 0 && <span className="text-good">+{formatMoney(income, currency)}</span>}
      {spent !== null && <span className="text-ink-500">{formatMoney(spent, currency)}</span>}
    </span>
  )
}

// Money in, or an automatic investment — shown in green, never needs editing.
function WinRow({ w, currency }: { w: Win; currency: string }) {
  const sameAsStream = w.title === w.subtitle
  return (
    <div className="w-full flex items-center gap-3 py-2.5 px-2 rounded-xl">
      <span className="h-9 w-9 rounded-full bg-good/15 flex items-center justify-center text-lg shrink-0">
        {w.kind === 'payment' ? '💼' : '📈'}
      </span>
      <div className="flex-1 min-w-0">
        <div className="text-sm text-ink-100 truncate">{w.kind === 'investment' ? `Invested · ${w.subtitle}` : w.title}</div>
        <div className="text-xs text-ink-500">
          {w.kind === 'investment' ? 'Added automatically' : sameAsStream ? 'Came in' : `${w.subtitle} · came in`}
        </div>
      </div>
      <span className="text-sm font-medium tabular-nums text-good">+{formatMoney(w.amount, currency)}</span>
    </div>
  )
}

function TxnRow({
  t,
  categoryMap,
  accountMap,
  currency,
  onClick,
}: {
  t: Transaction
  categoryMap: Map<string, Category>
  accountMap: Map<string, Account>
  currency: string
  onClick: () => void
}) {
  const cat = categoryMap.get(t.categoryId)
  const acc = accountMap.get(t.accountId)
  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-3 py-2.5 px-2 rounded-xl hover:bg-ink-800/60 transition text-left"
    >
      <span className="h-9 w-9 rounded-full bg-ink-800 flex items-center justify-center text-lg shrink-0">
        {cat?.icon ?? '❓'}
      </span>
      <div className="flex-1 min-w-0">
        <div className="text-sm text-ink-100 truncate">{t.note || cat?.name || 'Expense'}</div>
        <div className="text-xs text-ink-500 flex items-center gap-1.5">
          {acc && <span className="h-2 w-2 rounded-full" style={{ backgroundColor: acc.color }} />}
          {cat?.name}
          {t.source === 'recurring' && <span className="text-brand-400">· auto</span>}
          {t.source === 'import' && <span className="text-ink-400">· imported</span>}
          {t.receiptPath && <span title="Has receipt">· 📎</span>}
        </div>
      </div>
      <div className="text-right shrink-0">
        <div className={`text-sm font-medium tabular-nums ${t.amount < 0 ? 'text-good' : 'text-ink-100'}`}>
          {formatMoney(t.amount, currency)}
        </div>
        {t.createdAt ? <div className="text-[11px] text-ink-500 tabular-nums">{formatTime(t.createdAt)}</div> : null}
      </div>
    </button>
  )
}

// Month calendar with each day's net spend; tap a day to see its activity.
function CalendarView({
  txns,
  wins,
  categoryMap,
  accountMap,
  currency,
  onEdit,
}: {
  txns: Transaction[] | undefined
  wins: Win[]
  categoryMap: Map<string, Category>
  accountMap: Map<string, Account>
  currency: string
  onEdit: (t: Transaction) => void
}) {
  const [ref, setRef] = useState(() => {
    const d = new Date()
    return new Date(d.getFullYear(), d.getMonth(), 1)
  })
  const [selected, setSelected] = useState<string>(todayISO())

  const year = ref.getFullYear()
  const month = ref.getMonth()
  const pad = (n: number) => String(n).padStart(2, '0')
  const iso = (d: number) => `${year}-${pad(month + 1)}-${pad(d)}`

  const active = useMemo(() => (txns ?? []).filter((t) => !t.deleted), [txns])

  const dayTotals = useMemo(() => {
    const prefix = `${year}-${pad(month + 1)}-`
    const m = new Map<string, number>()
    for (const t of active) if (t.date.startsWith(prefix)) m.set(t.date, (m.get(t.date) ?? 0) + t.amount)
    return m
  }, [active, year, month])

  const monthTotal = useMemo(() => {
    let s = 0
    for (const v of dayTotals.values()) s += v
    return s
  }, [dayTotals])

  const dayTxns = useMemo(
    () => active.filter((t) => t.date === selected).sort((a, b) => b.createdAt - a.createdAt),
    [active, selected],
  )
  const selectedTotal = dayTxns.reduce((a, b) => a + b.amount, 0)

  const winsByDay = useMemo(() => {
    const m = new Map<string, Win[]>()
    for (const w of wins) m.set(w.date, [...(m.get(w.date) ?? []), w])
    return m
  }, [wins])
  const monthIn = useMemo(() => {
    const prefix = `${year}-${pad(month + 1)}-`
    return wins.filter((w) => w.date.startsWith(prefix)).reduce((s, w) => s + w.amount, 0)
  }, [wins, year, month])
  const dayWins = winsByDay.get(selected) ?? []
  const dayIn = dayWins.reduce((s, w) => s + w.amount, 0)

  // Week starts Monday: shift Sun(0)..Sat(6) so Monday is the first column.
  const lead = (new Date(year, month, 1).getDay() + 6) % 7
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const cells: (number | null)[] = []
  for (let i = 0; i < lead; i++) cells.push(null)
  for (let d = 1; d <= daysInMonth; d++) cells.push(d)
  while (cells.length % 7 !== 0) cells.push(null)

  const today = todayISO()
  const WEEK = ['M', 'T', 'W', 'T', 'F', 'S', 'S']

  // Move month and keep the selected day inside the visible month, so the
  // highlight and the day-detail below always agree.
  function goMonth(delta: number) {
    const nr = new Date(year, month + delta, 1)
    const now = new Date()
    const inThisMonth = now.getFullYear() === nr.getFullYear() && now.getMonth() === nr.getMonth()
    setRef(nr)
    setSelected(inThisMonth ? todayISO() : `${nr.getFullYear()}-${pad(nr.getMonth() + 1)}-01`)
  }

  return (
    <div className="pb-24">
      {/* Month switcher */}
      <div className="flex items-center justify-between mb-3">
        <button onClick={() => goMonth(-1)} className="p-2 text-ink-400 hover:text-ink-100">
          <ChevronLeft width={20} height={20} />
        </button>
        <div className="text-center">
          <div className="text-sm font-medium text-ink-200">
            {ref.toLocaleDateString('en-US', { month: 'long', year: 'numeric' })}
          </div>
          <div className="text-xs text-ink-500 tabular-nums">
            {monthIn > 0 && <span className="text-good">+{formatMoney(monthIn, currency)} in · </span>}
            {formatMoney(monthTotal, currency)} spent
          </div>
        </div>
        <button onClick={() => goMonth(1)} className="p-2 text-ink-400 hover:text-ink-100">
          <ChevronRight width={20} height={20} />
        </button>
      </div>

      {/* Weekday header */}
      <div className="grid grid-cols-7 gap-1 mb-1">
        {WEEK.map((w, i) => (
          <div key={i} className="text-center text-[10px] text-ink-500">
            {w}
          </div>
        ))}
      </div>

      {/* Day grid */}
      <div className="grid grid-cols-7 gap-1">
        {cells.map((d, i) => {
          if (d == null) return <div key={i} />
          const dISO = iso(d)
          const total = dayTotals.get(dISO)
          const isSelected = dISO === selected
          const isToday = dISO === today
          return (
            <button
              key={i}
              onClick={() => setSelected(dISO)}
              className={`min-h-[2.9rem] rounded-lg p-1 flex flex-col justify-between transition ${
                isSelected
                  ? 'bg-brand-500/20 ring-1 ring-brand-500'
                  : total != null
                    ? 'bg-ink-800/70'
                    : 'bg-ink-800/25'
              }`}
            >
              <span className="flex items-center justify-between self-stretch">
                <span className={`text-[10px] ${isToday ? 'text-brand-400 font-bold' : 'text-ink-400'}`}>{d}</span>
                {winsByDay.has(dISO) && <span className="h-1.5 w-1.5 rounded-full bg-good" aria-label="money in" />}
              </span>
              {total != null ? (
                <span
                  className={`text-xs tabular-nums font-medium leading-none self-end ${
                    total < 0 ? 'text-good' : 'text-ink-100'
                  }`}
                >
                  {cellAmount(total)}
                </span>
              ) : (
                <span className="self-end text-ink-700 leading-none">·</span>
              )}
            </button>
          )
        })}
      </div>

      {/* Selected day's activity */}
      <div className="mt-5">
        <div className="flex items-center justify-between mb-2">
          <span className="text-sm font-medium text-ink-200">{formatDayLabel(selected)}</span>
          <DayTotals spent={dayTxns.length > 0 ? selectedTotal : null} income={dayIn} currency={currency} />
        </div>
        {dayTxns.length === 0 && dayWins.length === 0 ? (
          <p className="text-sm text-ink-500 py-6 text-center">No activity on this day.</p>
        ) : (
          <div className="space-y-1">
            {dayWins.map((w) => (
              <WinRow key={w.id} w={w} currency={currency} />
            ))}
            {dayTxns.map((t) => (
              <TxnRow
                key={t.id}
                t={t}
                categoryMap={categoryMap}
                accountMap={accountMap}
                currency={currency}
                onClick={() => onEdit(t)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

// Compact day-cell amount, e.g. 53, 1.2k, 12k (no currency symbol to fit).
function cellAmount(n: number): string {
  const a = Math.abs(n)
  const sign = n < 0 ? '-' : ''
  if (a >= 1000) return `${sign}${(a / 1000).toFixed(a >= 10000 ? 0 : 1)}k`
  return `${sign}${Math.round(a)}`
}

type Suggestion =
  | { kind: 'category'; label: string; icon: string }
  | { kind: 'wallet'; label: string; color: string }
  | { kind: 'note'; label: string }

// Autocomplete search: suggests categories, wallets and past notes as you type
// — and lists your categories the moment you focus the empty field, so you can
// browse when you can't recall what's there.
function SearchBox({
  value,
  onChange,
  categories,
  accounts,
  txns,
}: {
  value: string
  onChange: (v: string) => void
  categories: Category[] | undefined
  accounts: Account[] | undefined
  txns: Transaction[] | undefined
}) {
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(-1)
  const boxRef = useRef<HTMLDivElement>(null)

  const suggestions = useMemo<Suggestion[]>(() => {
    const q = value.trim().toLowerCase()
    const cats: Suggestion[] = (categories ?? []).map((c) => ({ kind: 'category', label: c.name, icon: c.icon }))
    const wallets: Suggestion[] = (accounts ?? []).map((a) => ({ kind: 'wallet', label: a.name, color: a.color }))
    const noteCount = new Map<string, number>()
    for (const t of txns ?? []) {
      const n = t.note?.trim()
      if (n) noteCount.set(n, (noteCount.get(n) ?? 0) + 1)
    }
    const notes: Suggestion[] = [...noteCount.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([label]) => ({ kind: 'note', label }))

    let all = [...cats, ...wallets, ...notes]
    if (q) all = all.filter((s) => s.label.toLowerCase().includes(q) && s.label.toLowerCase() !== q)

    const seen = new Set<string>()
    const out: Suggestion[] = []
    for (const s of all) {
      const key = s.kind + ':' + s.label.toLowerCase()
      if (seen.has(key)) continue
      seen.add(key)
      out.push(s)
      if (out.length >= 8) break
    }
    return out
  }, [value, categories, accounts, txns])

  // Close when tapping/clicking outside the box.
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => {
      if (boxRef.current && !boxRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [open])

  useEffect(() => setActive(-1), [value])

  function choose(s: Suggestion) {
    onChange(s.label)
    setOpen(false)
    setActive(-1)
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'Escape') return setOpen(false)
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      if (!open) return setOpen(true)
      setActive((i) => Math.min(i + 1, suggestions.length - 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setActive((i) => Math.max(i - 1, 0))
    } else if (e.key === 'Enter') {
      if (active >= 0 && suggestions[active]) {
        e.preventDefault()
        choose(suggestions[active])
      } else {
        setOpen(false)
      }
    }
  }

  const showDropdown = open && suggestions.length > 0

  return (
    <div ref={boxRef} className="relative mb-5">
      <div className="flex items-center bg-ink-800 border border-ink-700 rounded-xl px-4 py-2.5 focus-within:border-brand-500">
        <input
          value={value}
          onChange={(e) => {
            onChange(e.target.value)
            setOpen(true)
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={onKeyDown}
          placeholder="Search category, wallet or note…"
          role="combobox"
          aria-expanded={showDropdown}
          aria-autocomplete="list"
          className="flex-1 bg-transparent text-sm text-ink-100 placeholder:text-ink-500 focus:outline-none"
        />
        {value && (
          <button
            onClick={() => {
              onChange('')
              setOpen(true)
            }}
            className="ml-2 text-ink-500 hover:text-ink-200"
            aria-label="Clear search"
          >
            <CloseIcon width={16} height={16} />
          </button>
        )}
      </div>

      {showDropdown && (
        <div className="absolute z-20 mt-1 w-full rounded-xl bg-ink-800 border border-ink-700 shadow-xl overflow-hidden">
          {!value.trim() && (
            <div className="px-3 pt-2 pb-1 text-[11px] uppercase tracking-wide text-ink-500">Tap to filter</div>
          )}
          <ul className="max-h-72 overflow-y-auto no-scrollbar py-1">
            {suggestions.map((s, i) => (
              <li key={s.kind + s.label}>
                <button
                  // onMouseDown (not onClick) so selection fires before the
                  // input's blur can close the dropdown.
                  onMouseDown={(e) => {
                    e.preventDefault()
                    choose(s)
                  }}
                  className={`w-full flex items-center gap-3 px-3 py-2 text-left text-sm ${
                    i === active ? 'bg-ink-700' : 'hover:bg-ink-700/60'
                  }`}
                >
                  {s.kind === 'category' && <span className="text-base">{s.icon}</span>}
                  {s.kind === 'wallet' && <span className="h-3 w-3 rounded-full" style={{ backgroundColor: s.color }} />}
                  {s.kind === 'note' && <span className="text-ink-500">📝</span>}
                  <span className="flex-1 text-ink-100 truncate">{s.label}</span>
                  <span className="text-[11px] text-ink-500 capitalize">{s.kind}</span>
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}
