import { useMemo, useState } from 'react'
import { useAllTransactions, useLookups, useSettings } from '../hooks/useData'
import { formatMoney, formatDayLabel } from '../lib/format'
import type { Transaction } from '../lib/types'
import EditTransaction from './EditTransaction'

export default function TransactionsScreen() {
  const txns = useAllTransactions()
  const settings = useSettings()
  const { accountMap, categoryMap } = useLookups()
  const [editing, setEditing] = useState<Transaction | null>(null)
  const [filter, setFilter] = useState('')

  const grouped = useMemo(() => {
    const list = (txns ?? [])
      .filter((t) => {
        if (!filter) return true
        const cat = categoryMap.get(t.categoryId)?.name ?? ''
        return (t.note + ' ' + cat).toLowerCase().includes(filter.toLowerCase())
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
      <input
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        placeholder="Search notes or categories…"
        className="w-full bg-ink-800 border border-ink-700 rounded-xl px-4 py-2.5 text-sm text-ink-100 placeholder:text-ink-500 focus:outline-none focus:border-brand-500 mb-5"
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
