import { useMemo, useState } from 'react'
import Sheet from './Sheet'
import AssetsSheet from './AssetsSheet'
import WellbeingSheet from './WellbeingSheet'
import { describeCover, useWins } from '../hooks/useWins'
import {
  useAccounts,
  useAllTransactions,
  useCategories,
  useIncomeOverrides,
  useIncomePayments,
  useIncomeSources,
  useRecurring,
  useSettings,
} from '../hooks/useData'
import { getCycle, cycleStartISO, cycleEndISO } from '../lib/cycle'
import { computeDashboard } from '../lib/selectors'
import { resolveIncome } from '../lib/income'
import { formatMoney, formatMoneyShort, formatShortDate } from '../lib/format'

// "Feeling broke?" — opened instead of a banking app when the sinking feeling
// hits. Shows, in one calm place, what's actually true today. Every figure comes
// from what's recorded in Duit; nothing is rounded up or estimated.
export default function GroundingSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const wins = useWins()
  const settings = useSettings()
  const txns = useAllTransactions()
  const categories = useCategories()
  const accounts = useAccounts()
  const recurring = useRecurring()
  const sources = useIncomeSources()
  const overrides = useIncomeOverrides()
  const payments = useIncomePayments()
  const [assetsOpen, setAssetsOpen] = useState(false)
  const [wellbeingOpen, setWellbeingOpen] = useState(false)
  const currency = settings?.currency ?? 'RM'

  // This month, exactly as Home shows it: income − spent − bills still due.
  const month = useMemo(() => {
    if (!settings || !txns || !categories || !accounts || !recurring || !sources || !overrides || !payments) return null
    const cycle = getCycle(settings.cycleStartDay)
    const start = cycleStartISO(cycle)
    const end = cycleEndISO(cycle)
    const inCycle = txns.filter((t) => t.date >= start && t.date <= end)
    const income = resolveIncome(sources, overrides, cycle.key, payments, { start, end }).total
    const d = computeDashboard(inCycle, categories, accounts, recurring, settings, cycle, income)
    return { cycle, income, spent: d.totalSpent, due: d.remainingRecurring, keeping: d.projectedSavings }
  }, [settings, txns, categories, accounts, recurring, sources, overrides, payments])

  if (!open) return null
  const ready = wins && month
  const { worth, wellbeing, coverUsual, coverBills } = wins ?? ({} as NonNullable<typeof wins>)
  const timesOver =
    ready && wellbeing.emergencyAmount > 0 && worth.safetyNet > 0 ? worth.safetyNet / wellbeing.emergencyAmount : null
  const pastMonths = ready ? wins.recent.filter((m) => m.hasSpending || m.income > 0) : []
  const barMax = Math.max(1, ...pastMonths.flatMap((m) => [m.income, m.spent]))

  return (
    <Sheet open={open} onClose={onClose} title="Let's look at what's true" full>
      {!ready ? (
        <div className="text-ink-500 text-sm py-8 text-center">One moment…</div>
      ) : (
        <div className="space-y-4">
          <p className="text-sm text-ink-300 leading-relaxed">
            That sinking feeling is real, and it makes sense. But it's remembering a harder time. It isn't reading
            today. Here's today.
          </p>

          {/* How long you're covered */}
          {worth.safetyNet > 0 && coverUsual ? (
            <Card tone="good">
              <div className="text-xs text-good/90 mb-0.5">You're covered</div>
              <div className="text-2xl font-bold text-ink-100">{describeCover(coverUsual)}</div>
              <p className="text-sm text-ink-300 mt-1.5 leading-relaxed">
                Your safety net of {formatMoney(worth.safetyNet, currency)} would pay for your usual spending for{' '}
                {coverUsual.days} days, even if no money came in at all.
              </p>
              {coverBills && (
                <p className="text-xs text-ink-400 mt-1.5">
                  Covering only your fixed bills: {describeCover(coverBills)}.
                </p>
              )}
            </Card>
          ) : (
            <Card>
              <p className="text-sm text-ink-300 mb-2">
                Add your savings and Duit will show how long you're covered, even if nothing came in.
              </p>
              <LinkButton onClick={() => setAssetsOpen(true)}>Add your savings →</LinkButton>
            </Card>
          )}

          {/* Today vs a past emergency */}
          {timesOver !== null ? (
            <Card>
              <p className="text-sm text-ink-300 leading-relaxed">
                {wellbeing.emergencyLabel ? (
                  <>
                    Your <span className="text-ink-100">{wellbeing.emergencyLabel}</span> cost{' '}
                    {formatMoney(wellbeing.emergencyAmount, currency)}.
                  </>
                ) : (
                  <>Your hardest money moment cost {formatMoney(wellbeing.emergencyAmount, currency)}.</>
                )}{' '}
                {timesOver >= 1 ? (
                  <>
                    Today, your safety net could cover it{' '}
                    <span className="text-good font-semibold">{Math.floor(timesOver)} times over</span>, without
                    touching a single month's income.
                  </>
                ) : (
                  <>Today, your safety net already covers {Math.floor(timesOver * 100)}% of it, and it's growing.</>
                )}
              </p>
            </Card>
          ) : (
            worth.safetyNet > 0 && (
              <LinkButton onClick={() => setWellbeingOpen(true)}>Compare with a past money emergency →</LinkButton>
            )
          )}

          {/* This month */}
          <Card>
            <div className="text-xs text-ink-400 mb-1">This month so far</div>
            <p className="text-sm text-ink-300 leading-relaxed">
              <span className="text-good font-semibold">{formatMoney(month.income, currency)}</span> came in.{' '}
              {month.keeping >= 0 ? (
                <>
                  After everything you've spent and the bills still due, you're keeping{' '}
                  <span className="text-ink-100 font-semibold">{formatMoney(month.keeping, currency)}</span>.
                </>
              ) : (
                <>
                  Spending and bills are {formatMoney(-month.keeping, currency)} ahead of that this month. That's
                  exactly what savings are for, and it's one month, not your whole picture.
                </>
              )}
            </p>
          </Card>

          {/* Recent months: money in vs money out */}
          {pastMonths.length > 0 && (
            <Card>
              <div className="text-xs text-ink-400 mb-2">Recent months</div>
              <div className="space-y-3">
                {pastMonths.map((m) => (
                  <div key={m.cycle.key}>
                    <div className="flex items-center justify-between text-xs mb-1">
                      <span className="text-ink-300">{m.cycle.label.split(' ')[0]}</span>
                      <span className={m.kept >= 0 ? 'text-good' : 'text-ink-400'}>
                        {m.kept >= 0 ? `kept ${formatMoneyShort(m.kept, currency)}` : `${formatMoneyShort(-m.kept, currency)} from savings`}
                      </span>
                    </div>
                    <Bar label="In" value={m.income} max={barMax} color="bg-good" currency={currency} />
                    <Bar label="Out" value={m.spent} max={barMax} color="bg-ink-500" currency={currency} />
                  </div>
                ))}
              </div>
            </Card>
          )}

          {/* Net worth */}
          {worth.hasAny && (
            <Card tone="good">
              <div className="text-xs text-ink-400 mb-0.5">Everything you've built</div>
              <div className="text-2xl font-bold text-ink-100">{formatMoney(worth.netWorth, currency)}</div>
              {worth.monthlyInvesting > 0 && (
                <p className="text-sm text-ink-300 mt-1.5">
                  {formatMoney(worth.monthlyInvesting, currency)} goes into your investments automatically every
                  month, whether you check or not.
                </p>
              )}
            </Card>
          )}

          <p className="text-sm text-ink-200 leading-relaxed pt-1">
            You've been somewhere much harder with money, and you got yourself here. This isn't luck or vapour. It's
            what you built.
          </p>
          <p className="text-[11px] text-ink-500">
            Based on what's recorded in Duit.
            {worth.savingsAsOf && ` Savings last updated ${formatShortDate(worth.savingsAsOf)}.`}
          </p>

          <button onClick={onClose} className="w-full py-3 rounded-xl bg-ink-800 border border-ink-700 text-ink-200 font-medium">
            Thank you. I'm okay
          </button>
        </div>
      )}

      <AssetsSheet open={assetsOpen} onClose={() => setAssetsOpen(false)} />
      <WellbeingSheet open={wellbeingOpen} onClose={() => setWellbeingOpen(false)} />
    </Sheet>
  )
}

function Card({ children, tone }: { children: React.ReactNode; tone?: 'good' }) {
  return (
    <div
      className={`rounded-2xl p-4 border ${
        tone === 'good' ? 'bg-good/10 border-good/25' : 'bg-ink-800/60 border-ink-700'
      }`}
    >
      {children}
    </div>
  )
}

function LinkButton({ onClick, children }: { onClick: () => void; children: React.ReactNode }) {
  return (
    <button onClick={onClick} className="text-sm text-brand-400 font-medium">
      {children}
    </button>
  )
}

function Bar({ label, value, max, color, currency }: { label: string; value: number; max: number; color: string; currency: string }) {
  return (
    <div className="flex items-center gap-2 text-[11px] text-ink-500">
      <span className="w-7">{label}</span>
      <div className="flex-1 h-2 rounded-full bg-ink-900 overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${Math.max(0, Math.min(value / max, 1)) * 100}%` }} />
      </div>
      <span className="w-16 text-right tabular-nums text-ink-400">{formatMoneyShort(value, currency)}</span>
    </div>
  )
}
