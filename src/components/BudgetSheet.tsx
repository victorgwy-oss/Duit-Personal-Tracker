import Sheet from './Sheet'
import { useCategories, useSettings } from '../hooks/useData'
import { upsertCategory } from '../lib/repo'
import type { Category } from '../lib/types'

// One place to set a monthly budget on ANY category — not just the imported
// Food budget. Each row edits that category's monthlyBudget directly.
export default function BudgetSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const categories = useCategories()
  const settings = useSettings()
  const currency = settings?.currency ?? 'RM'

  const list = (categories ?? []).slice().sort((a, b) => {
    // Categories that already have a budget float to the top.
    if ((b.monthlyBudget > 0 ? 1 : 0) !== (a.monthlyBudget > 0 ? 1 : 0)) {
      return (b.monthlyBudget > 0 ? 1 : 0) - (a.monthlyBudget > 0 ? 1 : 0)
    }
    return a.name.localeCompare(b.name)
  })

  const total = list.reduce((sum, c) => sum + (c.monthlyBudget || 0), 0)

  async function setBudget(cat: Category, value: string) {
    const num = parseFloat(value || '0')
    if (Number.isNaN(num) || num === cat.monthlyBudget) return
    await upsertCategory({
      id: cat.id,
      name: cat.name,
      group: cat.group,
      color: cat.color,
      icon: cat.icon,
      monthlyBudget: Math.max(num, 0),
    })
  }

  return (
    <Sheet open={open} onClose={onClose} title="Budgets" full>
      <p className="text-sm text-ink-400 mb-4">
        Set a monthly cap on any category. Leave it at 0 to track spending without a limit.
      </p>

      <div className="rounded-2xl bg-ink-800/60 border border-ink-700 px-4 py-3 mb-4 flex items-center justify-between">
        <span className="text-sm text-ink-300">Total budgeted</span>
        <span className="text-lg font-bold text-ink-100 tabular-nums">
          {currency}
          {total.toLocaleString('en-MY')}
        </span>
      </div>

      <div className="space-y-2">
        {list.map((c) => (
          <div key={c.id} className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-ink-800 border border-ink-700">
            <span className="text-lg">{c.icon}</span>
            <div className="flex-1 min-w-0">
              <div className="text-sm text-ink-100 truncate">{c.name}</div>
              <div className="text-xs text-ink-500 capitalize">{c.group}</div>
            </div>
            <div className="flex items-center bg-ink-900 border border-ink-700 rounded-lg px-2.5 py-1.5 w-28">
              <span className="text-ink-500 text-xs mr-1">{currency}</span>
              <input
                type="number"
                inputMode="decimal"
                defaultValue={c.monthlyBudget || ''}
                key={`${c.id}:${c.monthlyBudget}`}
                placeholder="0"
                onBlur={(e) => setBudget(c, e.target.value)}
                className="flex-1 min-w-0 bg-transparent text-right text-ink-100 text-sm focus:outline-none tabular-nums"
              />
            </div>
          </div>
        ))}
      </div>
    </Sheet>
  )
}
