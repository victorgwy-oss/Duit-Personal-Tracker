import { useMemo, useState } from 'react'
import Sheet from './Sheet'
import AmountField from './AmountField'
import { useIncomeOverrides, useIncomeSources, useSettings } from '../hooks/useData'
import { deleteIncomeSource, setIncomeOverride, upsertIncomeSource } from '../lib/repo'
import { resolveIncome } from '../lib/income'
import { getCycle, shiftCycle } from '../lib/cycle'
import { formatMoney } from '../lib/format'
import { ChevronLeft, ChevronRight } from './icons'
import type { IncomeSource } from '../lib/types'

const COLORS = ['#22c55e', '#0ea5e9', '#a855f7', '#f59e0b', '#ec4899', '#14b8a6', '#6366f1', '#f472b6']

// Editor for the user's income streams. The month switcher lets them set a
// different figure for a given month (e.g. business revenue that fluctuates)
// while salary/rent keep their steady default.
export default function IncomeSheet({
  open,
  onClose,
  initialOffset = 0,
}: {
  open: boolean
  onClose: () => void
  initialOffset?: number
}) {
  const settings = useSettings()
  const sources = useIncomeSources()
  const overrides = useIncomeOverrides()
  const [offset, setOffset] = useState(initialOffset)
  const [editing, setEditing] = useState<IncomeSource | 'new' | null>(null)

  const cycle = useMemo(() => {
    if (!settings) return null
    const base = getCycle(settings.cycleStartDay)
    return offset === 0 ? base : shiftCycle(base, settings.cycleStartDay, offset)
  }, [settings, offset])

  const currency = settings?.currency ?? 'RM'
  const monthKey = cycle?.key ?? ''
  const resolved = useMemo(
    () => resolveIncome(sources ?? [], overrides ?? [], monthKey),
    [sources, overrides, monthKey],
  )

  return (
    <Sheet open={open} onClose={onClose} title="Income" full>
      {/* Month switcher */}
      <div className="flex items-center justify-between mb-4">
        <button onClick={() => setOffset(offset - 1)} className="p-2 text-ink-400 hover:text-ink-100">
          <ChevronLeft width={20} height={20} />
        </button>
        <div className="text-sm font-medium text-ink-200">{cycle?.label ?? '—'}</div>
        <button
          onClick={() => setOffset(offset + 1)}
          className="p-2 text-ink-400 hover:text-ink-100"
        >
          <ChevronRight width={20} height={20} />
        </button>
      </div>

      <div className="rounded-2xl bg-gradient-to-br from-ink-800 to-ink-900 border border-ink-800 p-4 mb-4">
        <div className="text-xs text-ink-400">Total income · {cycle?.label}</div>
        <div className="text-3xl font-bold text-ink-100 tabular-nums mt-0.5">
          {formatMoney(resolved.total, currency)}
        </div>
      </div>

      <div className="space-y-2 mb-4">
        {resolved.lines.map(({ source, amount, overridden }) => (
          <div key={source.id} className="rounded-xl bg-ink-800 border border-ink-700 px-3 py-2.5">
            <div className="flex items-center gap-2 mb-2">
              <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: source.color }} />
              <button onClick={() => setEditing(source)} className="text-sm text-ink-100 flex-1 text-left">
                {source.name}
              </button>
              {overridden ? (
                <button
                  onClick={() => setIncomeOverride(source.id, monthKey, null)}
                  className="text-xs text-brand-400"
                >
                  set for {cycle?.label.split(' ')[0]} · reset
                </button>
              ) : (
                <span className="text-xs text-ink-500">default</span>
              )}
            </div>
            <AmountField
              value={amount}
              onChange={(n) => setIncomeOverride(source.id, monthKey, n)}
              currency={currency}
              title={`${source.name} · ${cycle?.label ?? ''}`}
            />
          </div>
        ))}
      </div>

      <button
        onClick={() => setEditing('new')}
        className="w-full py-3 rounded-xl border border-dashed border-ink-600 text-ink-300 text-sm"
      >
        + Add income stream
      </button>

      <p className="text-xs text-ink-500 mt-3">
        Change an amount to set it just for {cycle?.label}. Streams keep their default in every other month
        until you change them.
      </p>

      {editing && (
        <SourceEditor
          source={editing === 'new' ? null : editing}
          currency={currency}
          onClose={() => setEditing(null)}
        />
      )}
    </Sheet>
  )
}

function SourceEditor({
  source,
  currency,
  onClose,
}: {
  source: IncomeSource | null
  currency: string
  onClose: () => void
}) {
  const [name, setName] = useState(source?.name ?? '')
  const [amount, setAmount] = useState(String(source?.defaultAmount ?? ''))
  const [color, setColor] = useState(source?.color ?? COLORS[0])

  async function save() {
    if (!name.trim()) return
    await upsertIncomeSource({
      id: source?.id,
      name: name.trim(),
      defaultAmount: parseFloat(amount || '0'),
      color,
      active: source?.active ?? true,
    })
    onClose()
  }

  async function remove() {
    if (!source) return
    await deleteIncomeSource(source.id)
    onClose()
  }

  return (
    <Sheet open onClose={onClose} title={source ? 'Edit stream' : 'New income stream'}>
      <div className="space-y-4">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Name (e.g. Salary, Rental, Business)"
          autoFocus
          className="w-full bg-ink-800 border border-ink-700 rounded-xl px-3 py-2.5 text-ink-100 focus:outline-none focus:border-brand-500"
        />
        <div>
          <div className="text-xs text-ink-400 mb-1.5">Typical monthly amount</div>
          <AmountField
            value={amount === '' ? 0 : parseFloat(amount)}
            onChange={(n) => setAmount(String(n))}
            currency={currency}
            title="Typical monthly amount"
          />
          <p className="text-xs text-ink-500 mt-1.5">
            The default used every month. Override individual months from the Income screen.
          </p>
        </div>
        <div>
          <div className="text-xs text-ink-400 mb-1.5">Colour</div>
          <div className="flex flex-wrap gap-2">
            {COLORS.map((c) => (
              <button
                key={c}
                onClick={() => setColor(c)}
                className={`h-8 w-8 rounded-full ${color === c ? 'ring-2 ring-white ring-offset-2 ring-offset-ink-900' : ''}`}
                style={{ backgroundColor: c }}
              />
            ))}
          </div>
        </div>
        <div className="flex gap-2 pt-2">
          {source && (
            <button onClick={remove} className="px-4 py-3 rounded-xl border border-ink-700 text-bad text-sm">
              Delete
            </button>
          )}
          <button onClick={save} className="flex-1 py-3 rounded-xl bg-brand-500 text-ink-950 font-semibold">
            Save
          </button>
        </div>
      </div>
    </Sheet>
  )
}
