import { useEffect, useMemo, useRef, useState } from 'react'
import { useAllTransactions, useLookups, useSettings } from '../hooks/useData'
import { formatMoney, formatDayLabel } from '../lib/format'
import type { Account, Category, Transaction } from '../lib/types'
import { CloseIcon } from '../components/icons'
import EditTransaction from './EditTransaction'

export default function TransactionsScreen() {
  const txns = useAllTransactions()
  const settings = useSettings()
  const { accounts, categories, accountMap, categoryMap } = useLookups()
  const [editing, setEditing] = useState<Transaction | null>(null)
  const [filter, setFilter] = useState('')

  const grouped = useMemo(() => {
    const list = (txns ?? [])
      .filter((t) => {
        if (!filter) return true
        const cat = categoryMap.get(t.categoryId)?.name ?? ''
        const acc = accountMap.get(t.accountId)?.name ?? ''
        return (t.note + ' ' + cat + ' ' + acc).toLowerCase().includes(filter.toLowerCase())
      })
      .sort((a, b) => (b.date === a.date ? b.createdAt - a.createdAt : b.date.localeCompare(a.date)))
    const groups: { date: string; items: Transaction[]; total: number }[] = []
    for (const t of list) {
      let g = groups.find((x) => x.date === t.date)
      if (!g) {
        g = { date: t.date, items: [], total: 0 }
        groups.push(g)
      }
      g.items.push(t)
      g.total += t.amount
    }
    return groups
  }, [txns, filter, categoryMap])

  const currency = settings?.currency ?? 'RM'

  return (
    <div className="px-5 pt-6 safe-top">
      <h1 className="text-2xl font-bold text-ink-100 mb-4">Activity</h1>
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
              <span className="text-xs text-ink-500 tabular-nums">{formatMoney(g.total, currency)}</span>
            </div>
            <div className="space-y-1">
              {g.items.map((t) => {
                const cat = categoryMap.get(t.categoryId)
                const acc = accountMap.get(t.accountId)
                return (
                  <button
                    key={t.id}
                    onClick={() => setEditing(t)}
                    className="w-full flex items-center gap-3 py-2.5 px-2 rounded-xl hover:bg-ink-800/60 transition text-left"
                  >
                    <span className="h-9 w-9 rounded-full bg-ink-800 flex items-center justify-center text-lg shrink-0">
                      {cat?.icon ?? '❓'}
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm text-ink-100 truncate">
                        {t.note || cat?.name || 'Expense'}
                      </div>
                      <div className="text-xs text-ink-500 flex items-center gap-1.5">
                        {acc && <span className="h-2 w-2 rounded-full" style={{ backgroundColor: acc.color }} />}
                        {cat?.name}
                        {t.source === 'recurring' && <span className="text-brand-400">· auto</span>}
                        {t.source === 'import' && <span className="text-ink-400">· imported</span>}
                        {t.receiptPath && <span title="Has receipt">· 📎</span>}
                      </div>
                    </div>
                    <span className={`text-sm font-medium tabular-nums ${t.amount < 0 ? 'text-good' : 'text-ink-100'}`}>
                      {formatMoney(t.amount, currency)}
                    </span>
                  </button>
                )
              })}
            </div>
          </div>
        ))}
      </div>

      <EditTransaction txn={editing} onClose={() => setEditing(null)} />
    </div>
  )
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
