import { useMemo, useState } from 'react'
import { useAccounts, useAllTransactions, useCategories, useSettings } from '../hooks/useData'
import { computeAnalytics, type MonthPoint } from '../lib/analytics'
import { formatMoney, formatMoneyShort } from '../lib/format'
import { CloseIcon } from '../components/icons'

const RANGES = [3, 6, 12] as const
type Range = (typeof RANGES)[number]

export default function Analytics() {
  const settings = useSettings()
  const txns = useAllTransactions()
  const categories = useCategories()
  const accounts = useAccounts()
  const [range, setRange] = useState<Range>(6)
  const [catId, setCatId] = useState<string | null>(null)

  const data = useMemo(() => {
    if (!settings || !txns || !categories || !accounts) return null
    return computeAnalytics(txns, categories, accounts, settings.cycleStartDay, range, catId)
  }, [settings, txns, categories, accounts, range, catId])

  const currency = settings?.currency ?? 'RM'
  const selectedCat = catId ? (categories ?? []).find((c) => c.id === catId) ?? null : null

  if (!data) return <div className="p-6 text-ink-500">Loading…</div>

  const empty = data.txnCount === 0

  return (
    <div className="px-5 pt-6 pb-16 safe-top">
      <h1 className="text-2xl font-bold text-ink-100 mb-4">Analytics</h1>

      {/* Range filter */}
      <div className="flex gap-2 mb-5">
        {RANGES.map((r) => (
          <button
            key={r}
            onClick={() => setRange(r)}
            className={`flex-1 py-2 rounded-lg text-sm ${
              range === r ? 'bg-brand-500 text-ink-950 font-medium' : 'bg-ink-800 text-ink-300'
            }`}
          >
            {r} months
          </button>
        ))}
      </div>

      {/* Active category filter chip */}
      {selectedCat && (
        <button
          onClick={() => setCatId(null)}
          className="inline-flex items-center gap-2 mb-4 px-3 py-1.5 rounded-full bg-brand-500/15 border border-brand-500/40 text-brand-400 text-sm"
        >
          <span>{selectedCat.icon}</span>
          <span>{selectedCat.name}</span>
          <CloseIcon width={14} height={14} />
        </button>
      )}

      {/* Headline tiles */}
      <div className="grid grid-cols-3 gap-2 mb-6">
        <StatTile label={selectedCat ? 'On this' : 'Total spent'} value={formatMoneyShort(data.rangeTotal, currency)} />
        <StatTile label="Avg / month" value={formatMoneyShort(data.avgPerMonth, currency)} />
        <StatTile label="Transactions" value={String(data.txnCount)} />
      </div>

      {empty ? (
        <div className="text-center text-ink-500 py-16">
          <p className="text-4xl mb-3">📊</p>
          <p>No spending in this range yet.</p>
        </div>
      ) : (
        <>
          {/* Monthly trend */}
          <Section title={selectedCat ? `${selectedCat.name} over time` : 'Spending by month'}>
            <TrendChart months={data.months} currency={currency} />
          </Section>

          {/* By category — hidden when already drilled into one */}
          {!selectedCat && data.byCategory.length > 0 && (
            <Section title="Where it goes" hint="Tap a category to zoom in">
              <div className="space-y-2.5">
                {data.byCategory.map((c) => (
                  <BreakdownBar
                    key={c.category.id}
                    label={`${c.category.icon} ${c.category.name}`}
                    color={c.category.color}
                    amount={c.spent}
                    share={c.share}
                    max={data.byCategory[0].spent}
                    currency={currency}
                    onClick={() => setCatId(c.category.id)}
                  />
                ))}
              </div>
            </Section>
          )}

          {/* By spending mode */}
          {data.byWalletType.length > 0 && (
            <Section title="By spending mode" hint="Which wallet the money left from">
              <div className="space-y-2.5">
                {data.byWalletType.map((w) => (
                  <BreakdownBar
                    key={w.type}
                    label={w.label}
                    color={w.color}
                    amount={w.spent}
                    share={w.share}
                    max={data.byWalletType[0].spent}
                    currency={currency}
                  />
                ))}
              </div>
            </Section>
          )}
        </>
      )}
    </div>
  )
}

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="mb-7">
      <div className="mb-3">
        <h3 className="text-sm font-semibold text-ink-300">{title}</h3>
        {hint && <p className="text-xs text-ink-500 mt-0.5">{hint}</p>}
      </div>
      {children}
    </section>
  )
}

function StatTile({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-2xl bg-ink-800/60 border border-ink-700 px-3 py-3">
      <div className="text-[11px] text-ink-500 leading-tight">{label}</div>
      <div className="text-lg font-bold text-ink-100 tabular-nums mt-1 truncate">{value}</div>
    </div>
  )
}

// Vertical bars, one series (brand). Tap a bar to read its exact figure.
function TrendChart({ months, currency }: { months: MonthPoint[]; currency: string }) {
  const [focus, setFocus] = useState<number | null>(null)
  const max = Math.max(...months.map((m) => m.total), 1)
  const focused = focus != null ? months[focus] : null

  return (
    <div>
      <div className="h-8 mb-1 text-center">
        {focused ? (
          <div className="text-sm">
            <span className="text-ink-100 font-semibold tabular-nums">{formatMoney(focused.total, currency)}</span>
            <span className="text-ink-500"> · {focused.cycle.label}</span>
          </div>
        ) : (
          <div className="text-xs text-ink-500 pt-1">Tap a bar for the exact amount</div>
        )}
      </div>
      <div className="flex items-end gap-1.5 h-40">
        {months.map((m, i) => {
          const h = Math.max((m.total / max) * 100, m.total > 0 ? 3 : 0)
          const active = focus === i
          return (
            <button
              key={m.cycle.key}
              onClick={() => setFocus(active ? null : i)}
              className="flex-1 h-full flex flex-col justify-end items-center group"
              aria-label={`${m.cycle.label}: ${formatMoney(m.total, currency)}`}
            >
              <div
                className={`w-full rounded-t transition-colors ${active ? 'bg-brand-400' : 'bg-brand-500/60 group-hover:bg-brand-500'}`}
                style={{ height: `${h}%`, minHeight: m.total > 0 ? 3 : 0 }}
              />
            </button>
          )
        })}
      </div>
      <div className="flex gap-1.5 mt-1.5">
        {months.map((m) => (
          <div key={m.cycle.key} className="flex-1 text-center text-[10px] text-ink-500">
            {m.cycle.label.slice(0, 3)}
          </div>
        ))}
      </div>
    </div>
  )
}

// Horizontal ranked bar. `share` is % of total; `max` scales the bar width so
// the largest fills the track.
function BreakdownBar({
  label,
  color,
  amount,
  share,
  max,
  currency,
  onClick,
}: {
  label: string
  color: string
  amount: number
  share: number
  max: number
  currency: string
  onClick?: () => void
}) {
  const width = max > 0 ? Math.max((amount / max) * 100, 2) : 0
  const Wrapper = onClick ? 'button' : 'div'
  return (
    <Wrapper onClick={onClick} className={`w-full block text-left ${onClick ? 'active:opacity-80' : ''}`}>
      <div className="flex items-center justify-between mb-1 text-sm">
        <span className="text-ink-200 truncate pr-2">{label}</span>
        <span className="text-ink-100 tabular-nums shrink-0">
          {formatMoney(amount, currency)}
          <span className="text-ink-500 text-xs ml-1.5">{Math.round(share * 100)}%</span>
        </span>
      </div>
      <div className="h-2.5 rounded-full bg-ink-800 overflow-hidden">
        <div className="h-full rounded-full" style={{ width: `${width}%`, backgroundColor: color }} />
      </div>
    </Wrapper>
  )
}
