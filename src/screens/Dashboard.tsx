import { useMemo, useState } from 'react'
import {
  useAccounts,
  useCategories,
  useIncomeOverrides,
  useIncomePayments,
  useIncomeSources,
  useRecurring,
  useSettings,
  useTransactionsInRange,
} from '../hooks/useData'
import { describeCover, useWins, type WinsPicture } from '../hooks/useWins'
import { getCycle, shiftCycle, cycleStartISO, cycleEndISO, cycleProgress } from '../lib/cycle'
import { computeDashboard } from '../lib/selectors'
import { resolveIncome } from '../lib/income'
import { forMeSpent } from '../lib/wins'
import { formatMoney, formatMoneyShort, formatShortDate } from '../lib/format'
import { cadenceLabel } from '../lib/recurring'
import { ChevronLeft, ChevronRight, CameraIcon, CheckIcon } from '../components/icons'
import IncomeSheet from '../components/IncomeSheet'
import BudgetSheet from '../components/BudgetSheet'
import GroundingSheet from '../components/GroundingSheet'
import AssetsSheet from '../components/AssetsSheet'
import WellbeingSheet from '../components/WellbeingSheet'

export default function Dashboard({ onScan }: { onScan: () => void }) {
  const settings = useSettings()
  const wins = useWins()
  const [offset, setOffset] = useState(0)
  const [incomeOpen, setIncomeOpen] = useState(false)
  const [budgetOpen, setBudgetOpen] = useState(false)
  const [groundingOpen, setGroundingOpen] = useState(false)
  const [assetsOpen, setAssetsOpen] = useState(false)
  const [wellbeingOpen, setWellbeingOpen] = useState(false)

  const cycle = useMemo(() => {
    if (!settings) return null
    const base = getCycle(settings.cycleStartDay)
    return offset === 0 ? base : shiftCycle(base, settings.cycleStartDay, offset)
  }, [settings, offset])

  const startISO = cycle ? cycleStartISO(cycle) : '0000-00-00'
  const endISO = cycle ? cycleEndISO(cycle) : '0000-00-00'
  const txns = useTransactionsInRange(startISO, endISO)
  const categories = useCategories()
  const accounts = useAccounts()
  const recurring = useRecurring()
  const incomeSources = useIncomeSources()
  const incomeOverrides = useIncomeOverrides()
  const incomePayments = useIncomePayments()

  const cycleIncome = useMemo(
    () =>
      resolveIncome(incomeSources ?? [], incomeOverrides ?? [], cycle?.key ?? '', incomePayments ?? [], {
        start: startISO,
        end: endISO,
      }).total,
    [incomeSources, incomeOverrides, incomePayments, cycle, startISO, endISO],
  )

  const data = useMemo(() => {
    if (!cycle || !txns || !categories || !accounts || !recurring || !settings) return null
    return computeDashboard(txns, categories, accounts, recurring, settings, cycle, cycleIncome)
  }, [cycle, txns, categories, accounts, recurring, settings, cycleIncome])

  if (!settings || !cycle || !data) return <div className="p-6 text-ink-500">Loading…</div>

  const { fraction } = cycleProgress(cycle)
  const currency = settings.currency

  return (
    <div className="px-5 pt-6 pb-16 safe-top">
      {/* Cycle switcher */}
      <div className="flex items-center justify-between mb-5">
        <button onClick={() => setOffset(offset - 1)} className="p-2 text-ink-400 hover:text-ink-100">
          <ChevronLeft width={20} height={20} />
        </button>
        <div className="text-center">
          <div className="text-sm font-medium text-ink-200">{cycle.label}</div>
          <div className="text-xs text-ink-500">
            {formatShortDate(startISO)} – {formatShortDate(endISO)}
            {offset === 0 && ` · ${data.daysLeft}d left`}
          </div>
        </div>
        <button
          onClick={() => setOffset(offset + 1)}
          disabled={offset >= 0}
          className="p-2 text-ink-400 hover:text-ink-100 disabled:opacity-30"
        >
          <ChevronRight width={20} height={20} />
        </button>
      </div>

      {/* A gentle way in when money suddenly feels scary — instead of a bank app. */}
      <button
        onClick={() => setGroundingOpen(true)}
        className="w-full mb-4 rounded-2xl border border-ink-700 bg-ink-800/50 px-4 py-3 text-left flex items-center gap-3 active:scale-[0.99] transition"
      >
        <span className="text-lg">🌿</span>
        <span className="flex-1">
          <span className="block text-sm text-ink-100">Feeling broke?</span>
          <span className="block text-xs text-ink-400">Let's look at what's true today</span>
        </span>
        <ChevronRight width={18} height={18} className="text-ink-500" />
      </button>

      {/* Wins first: what you've built, not just what went out. */}
      <WinsHero wins={wins} currency={currency} onManage={() => setAssetsOpen(true)} />

      {/* Savings projection */}
      <SavingsProjection data={data} currency={currency} onEditIncome={() => setIncomeOpen(true)} />

      {/* Just for me: permission, not a limit. */}
      {wins && wins.wellbeing.forMeMonthly > 0 && (
        <JustForMeCard
          fund={wins.wellbeing.forMeMonthly}
          spent={forMeSpent(txns ?? [], wins.wellbeing.forMeCategoryId, startISO, endISO)}
          fraction={fraction}
          currency={currency}
          onEdit={() => setWellbeingOpen(true)}
        />
      )}

      {/* Spending this cycle, with the wallet split. */}
      <div className="rounded-2xl bg-gradient-to-br from-ink-800 to-ink-900 border border-ink-800 p-5 mt-4 mb-4">
        <div className="text-ink-400 text-sm">Total spent this cycle</div>
        <div className="text-3xl font-bold text-ink-100 mt-1 tabular-nums">
          {formatMoney(data.totalSpent, currency)}
        </div>
        <div className="mt-4 space-y-3">
          {data.perWallet.map(({ account, spent }) => (
            <div key={account.id} className="flex items-center gap-3">
              <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: account.color }} />
              <span className="text-sm text-ink-300 flex-1">{account.name}</span>
              <span className="text-sm font-medium text-ink-100 tabular-nums">
                {formatMoney(spent, currency)}
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Credit card total so far, so the bill is never a surprise. */}
      <CardBalanceTile balance={data.cardBalance} currency={currency} onScan={onScan} />

      {/* Budget bars */}
      <section className="mt-6">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold text-ink-300">Budgets</h3>
          <button onClick={() => setBudgetOpen(true)} className="text-xs font-medium text-brand-400">
            {data.byCategory.some((c) => c.budget > 0) ? 'Edit' : '+ Add budget'}
          </button>
        </div>
        {data.byCategory.some((c) => c.budget > 0) ? (
          <div className="space-y-3">
            {data.byCategory
              .filter((c) => c.budget > 0)
              .map((c) => (
                <BudgetBar key={c.category.id} spent={c.spent} budget={c.budget} name={c.category.name} icon={c.category.icon} currency={currency} fraction={fraction} />
              ))}
          </div>
        ) : (
          <button
            onClick={() => setBudgetOpen(true)}
            className="w-full py-4 rounded-xl border border-dashed border-ink-600 text-ink-400 text-sm"
          >
            Set a monthly cap on any category — food, transport, shopping…
          </button>
        )}
      </section>

      {/* Committed upcoming recurring */}
      {data.upcoming.length > 0 && (
        <section className="mt-6">
          <h3 className="text-sm font-semibold text-ink-300 mb-1">Still coming this cycle</h3>
          <p className="text-xs text-ink-500 mb-3">
            Recurring charges not yet posted — {formatMoney(data.remainingRecurring, currency)} total.
          </p>
          <div className="space-y-2">
            {data.upcoming.map((u, i) => (
              <div key={i} className="flex items-center gap-3 bg-ink-800/60 rounded-xl px-3 py-2.5">
                <span className="text-ink-500 text-xs w-12 shrink-0">{formatShortDate(u.date)}</span>
                <span className="text-sm text-ink-200 flex-1">{u.rule.name}</span>
                <span className="text-xs text-ink-500">{cadenceLabel(u.rule)}</span>
                <span className="text-sm font-medium text-ink-100 tabular-nums">
                  {formatMoney(u.amount, currency)}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Category breakdown (chart added next) */}
      {data.byCategory.length > 0 && (
        <section className="mt-6 pb-4">
          <h3 className="text-sm font-semibold text-ink-300 mb-3">Where it went</h3>
          <div className="space-y-2">
            {data.byCategory.slice(0, 8).map((c) => (
              <div key={c.category.id} className="flex items-center gap-3">
                <span>{c.category.icon}</span>
                <span className="text-sm text-ink-300 flex-1">{c.category.name}</span>
                <span className="text-sm font-medium text-ink-100 tabular-nums">
                  {formatMoney(c.spent, currency)}
                </span>
              </div>
            ))}
          </div>
        </section>
      )}

      <IncomeSheet open={incomeOpen} onClose={() => setIncomeOpen(false)} initialOffset={offset} />
      <GroundingSheet open={groundingOpen} onClose={() => setGroundingOpen(false)} />
      <AssetsSheet open={assetsOpen} onClose={() => setAssetsOpen(false)} />
      <WellbeingSheet open={wellbeingOpen} onClose={() => setWellbeingOpen(false)} />
      <BudgetSheet open={budgetOpen} onClose={() => setBudgetOpen(false)} />
    </div>
  )
}

function WinsHero({
  wins,
  currency,
  onManage,
}: {
  wins: WinsPicture | null
  currency: string
  onManage: () => void
}) {
  if (!wins) return null
  const { worth, coverUsual } = wins
  if (!worth.hasAny) {
    return (
      <button
        onClick={onManage}
        className="w-full rounded-3xl border border-dashed border-good/40 bg-good/5 p-5 mb-4 text-left"
      >
        <div className="text-sm font-semibold text-good">Your wins, not just your spending</div>
        <div className="text-xs text-ink-400 mt-1">
          Add your bank accounts, FD, investments and EPF. See everything you've built in one place, growing
          right here.
        </div>
      </button>
    )
  }
  return (
    <button
      onClick={onManage}
      className="w-full rounded-3xl bg-gradient-to-br from-good/15 to-ink-900 border border-good/25 p-6 mb-4 text-left"
    >
      <div className="flex items-center justify-between">
        <span className="text-ink-400 text-sm">Your net worth</span>
        <span className="text-xs text-brand-400 font-medium">Update →</span>
      </div>
      <div className="text-4xl font-bold text-ink-100 mt-1 tabular-nums">{formatMoney(worth.netWorth, currency)}</div>
      <div className="mt-3 space-y-1 text-xs">
        {worth.safetyNet > 0 && (
          <div className="text-ink-300">
            Safety net {formatMoney(worth.safetyNet, currency)}
            {coverUsual ? ` · covers ${describeCover(coverUsual)} of your usual spending` : ''}
          </div>
        )}
        {worth.monthlyInvesting > 0 && (
          <div className="text-good">+{formatMoney(worth.monthlyInvesting, currency)} invested automatically every month</div>
        )}
      </div>
    </button>
  )
}

function JustForMeCard({
  fund,
  spent,
  fraction,
  currency,
  onEdit,
}: {
  fund: number
  spent: number
  fraction: number
  currency: string
  onEdit: () => void
}) {
  const left = fund - spent
  const pct = fund > 0 ? Math.min(Math.max(spent / fund, 0), 1) : 0
  const note =
    spent <= 0
      ? fraction >= 0.33
        ? "You haven't used any of it yet this month. It's already approved. It's there for you."
        : 'Already approved for you this month.'
      : left > 0
        ? `${formatMoney(left, currency)} still waiting for you this month.`
        : "You've enjoyed all of this month's fund. That's what it's for."
  return (
    <button onClick={onEdit} className="w-full rounded-2xl p-4 mt-4 border border-pink-400/25 bg-pink-400/10 text-left">
      <div className="flex items-center justify-between mb-1">
        <span className="text-sm font-semibold text-pink-300">Just for me 💛</span>
        <span className="text-xs text-ink-400 tabular-nums">
          {formatMoney(Math.max(spent, 0), currency)} of {formatMoneyShort(fund, currency)} enjoyed
        </span>
      </div>
      <div className="h-2 rounded-full bg-ink-800 overflow-hidden">
        <div className="h-full rounded-full bg-pink-400" style={{ width: `${pct * 100}%` }} />
      </div>
      <div className="text-xs text-ink-300 mt-2">{note}</div>
    </button>
  )
}

function CardBalanceTile({ balance, currency, onScan }: { balance: number; currency: string; onScan: () => void }) {
  return (
    <div className="rounded-2xl bg-ink-800/60 border border-ink-700 p-4 mb-4 flex items-center gap-4">
      <div className="flex-1">
        <div className="text-xs text-ink-400">Credit card this cycle</div>
        <div className="text-2xl font-bold text-ink-100 tabular-nums mt-0.5">
          {formatMoney(balance, currency)}
        </div>
        <div className="text-xs text-ink-500 mt-0.5">Your next bill so far, so it's never a surprise</div>
      </div>
      <button
        onClick={onScan}
        className="h-11 px-3 rounded-xl bg-ink-700 text-brand-400 flex items-center gap-2 text-sm font-medium active:scale-95 transition"
      >
        <CameraIcon width={18} height={18} /> Scan
      </button>
    </div>
  )
}

function SavingsProjection({
  data,
  currency,
  onEditIncome,
}: {
  data: ReturnType<typeof computeDashboard>
  currency: string
  onEditIncome: () => void
}) {
  const onTrack = data.onTrack
  const projected = data.projectedSavings
  const pct = data.savingsTarget > 0 ? Math.max(Math.min(projected / data.savingsTarget, 1), 0) : 0

  return (
    <div
      className={`rounded-2xl p-4 mb-2 border ${
        onTrack ? 'bg-good/10 border-good/30' : 'bg-ink-800/60 border-ink-700'
      }`}
    >
      {/* Calm, not alarming: a lighter month is information, not a warning. */}
      <div className="flex items-center gap-2 mb-1">
        {onTrack && <CheckIcon width={16} height={16} className="text-good" />}
        <span className={`text-sm font-semibold ${onTrack ? 'text-good' : 'text-ink-200'}`}>
          {onTrack ? 'On track to save' : 'A lighter month for savings'}
        </span>
      </div>
      <div className="mb-1">
        <div className="text-2xl font-bold text-ink-100 tabular-nums">
          {formatMoneyShort(projected, currency)}
        </div>
        <div className="text-xs text-ink-400">
          left after spending &amp; bills · target {formatMoneyShort(data.savingsTarget, currency)}
        </div>
      </div>
      <div className="mt-3 h-2 rounded-full bg-ink-800 overflow-hidden">
        <div
          className={`h-full rounded-full ${onTrack ? 'bg-good' : 'bg-brand-500'}`}
          style={{ width: `${pct * 100}%` }}
        />
      </div>

      {/* Breakdown so the figure reconciles line by line: income minus what
          you've spent and the bills still due. No run-rate guesswork. */}
      <div className="mt-4 space-y-1.5 text-xs">
        <Line
          label="Income this month"
          value={data.income}
          currency={currency}
          action={
            <button onClick={onEditIncome} className="ml-2 text-brand-400 font-medium">
              Adjust →
            </button>
          }
        />
        <Line label="Spent so far" value={-data.totalSpent} currency={currency} />
        <Line label="Bills still due" value={-data.remainingRecurring} currency={currency} />
        <div className="h-px bg-ink-700/60 my-1.5" />
        <Line label="Projected savings" value={projected} currency={currency} strong />
      </div>
    </div>
  )
}

function Line({
  label,
  value,
  currency,
  strong,
  muted,
  action,
}: {
  label: string
  value: number
  currency: string
  strong?: boolean
  muted?: boolean
  action?: React.ReactNode
}) {
  return (
    <div className="flex items-center justify-between">
      <span className={`flex items-center ${muted ? 'text-ink-500' : strong ? 'text-ink-200' : 'text-ink-400'}`}>
        {label}
        {action}
      </span>
      <span
        className={`tabular-nums ${
          strong ? 'text-ink-100 font-semibold' : muted ? 'text-ink-500' : 'text-ink-300'
        }`}
      >
        {formatMoney(value, currency)}
      </span>
    </div>
  )
}

function BudgetBar({
  spent,
  budget,
  name,
  icon,
  currency,
  fraction,
}: {
  spent: number
  budget: number
  name: string
  icon: string
  currency: string
  fraction: number
}) {
  const pct = budget > 0 ? spent / budget : 0
  const over = pct > 1
  // Pace line: where you "should" be if spending evenly through the cycle.
  const paceOk = pct <= fraction + 0.1
  // Calm colours: over budget is shown plainly in amber, never alarm red.
  const color = over ? 'bg-warn' : paceOk ? 'bg-good' : 'bg-brand-500'
  return (
    <div>
      <div className="flex items-center gap-2 mb-1 text-sm">
        <span>{icon}</span>
        <span className="text-ink-300 flex-1">{name}</span>
        <span className={`tabular-nums ${over ? 'text-warn' : 'text-ink-200'}`}>
          {formatMoney(spent, currency)}{' '}
          <span className="text-ink-500">/ {formatMoneyShort(budget, currency)}</span>
        </span>
      </div>
      <div className="relative h-2.5 rounded-full bg-ink-800 overflow-hidden">
        <div className={`h-full rounded-full ${color}`} style={{ width: `${Math.min(pct, 1) * 100}%` }} />
        {/* pace marker */}
        <div
          className="absolute top-0 h-full w-0.5 bg-ink-400/70"
          style={{ left: `${Math.min(fraction, 1) * 100}%` }}
        />
      </div>
    </div>
  )
}
