// The "wins" side of the picture: what you own, what's growing, how long you're
// covered, and what each month let you keep. Pure functions (no database), so
// every number shown can be tested. All figures are honest — nothing here
// rounds up, estimates income that wasn't recorded, or hides a hard month.

import type {
  Asset,
  IncomeOverride,
  IncomePayment,
  IncomeSource,
  RecurringRule,
  Transaction,
} from './types'
import { occurrencesInRange } from './recurring'
import { fromISO, toISO, todayISO } from './format'
import { type Cycle, cycleStartISO, cycleEndISO, shiftCycle } from './cycle'
import { resolveIncome } from './income'

export function addDaysISO(iso: string, n: number): string {
  const d = fromISO(iso)
  d.setDate(d.getDate() + n)
  return toISO(d)
}

// ---- Assets & net worth ----

function contributionRule(a: Asset): RecurringRule {
  return {
    id: a.id,
    name: a.name,
    amount: a.monthlyAdd ?? 0,
    accountId: '',
    categoryId: '',
    cadence: 'monthly',
    dayOfMonth: a.addDay ?? 1,
    startDate: a.addSince ?? a.asOf,
    active: true,
    mode: 'auto',
    lastPostedPeriod: null,
    updatedAt: 0,
  }
}

// Dates an automatic monthly contribution lands within [start, end]. Day 31 lands
// on the last day of shorter months, same as recurring charges.
export function contributionDates(a: Asset, start: string, end: string): string[] {
  if (a.deleted || a.kind === 'debt' || !a.monthlyAdd || a.monthlyAdd <= 0 || start > end) return []
  return occurrencesInRange(contributionRule(a), start, end)
}

// Current value: what you last entered, plus every contribution since.
export function assetValue(a: Asset, today: string = todayISO()): number {
  const added = contributionDates(a, addDaysISO(a.asOf, 1), today).length * (a.monthlyAdd ?? 0)
  return a.amount + added
}

export interface WorthSummary {
  hasAny: boolean
  netWorth: number // everything owned minus debts
  owned: number
  debts: number
  safetyNet: number // money you'd actually reach for: savings, plus investments you opt in
  monthlyInvesting: number // automatic contributions per month
  savingsAsOf: string | null // oldest "last updated" among savings, to stay honest
}

export function summarizeWorth(assets: Asset[], today: string = todayISO()): WorthSummary {
  let owned = 0
  let debts = 0
  let safetyNet = 0
  let monthlyInvesting = 0
  let savingsAsOf: string | null = null
  const live = assets.filter((a) => !a.deleted)
  for (const a of live) {
    const v = assetValue(a, today)
    if (a.kind === 'debt') {
      debts += v
      continue
    }
    owned += v
    // Savings always count; an investment counts only if the user says they'd
    // actually reach for it in an emergency.
    if (a.kind === 'savings' || (a.kind === 'investment' && a.inSafetyNet)) {
      safetyNet += v
      if (!savingsAsOf || a.asOf < savingsAsOf) savingsAsOf = a.asOf
    }
    if (a.monthlyAdd && a.monthlyAdd > 0) monthlyInvesting += a.monthlyAdd
  }
  return { hasAny: live.length > 0, netWorth: owned - debts, owned, debts, safetyNet, monthlyInvesting, savingsAsOf }
}

// ---- Months ----

export interface CycleKept {
  cycle: Cycle
  start: string
  end: string
  income: number
  spent: number
  kept: number // income − spent (can be negative; never hidden)
  hasSpending: boolean
}

export function keptForCycle(
  cycle: Cycle,
  txns: Transaction[],
  sources: IncomeSource[],
  overrides: IncomeOverride[],
  payments: IncomePayment[],
): CycleKept {
  const start = cycleStartISO(cycle)
  const end = cycleEndISO(cycle)
  let spent = 0
  let hasSpending = false
  for (const t of txns) {
    if (t.deleted || t.date < start || t.date > end) continue
    spent += t.amount
    hasSpending = true
  }
  const income = resolveIncome(sources, overrides, cycle.key, payments, { start, end }).total
  return { cycle, start, end, income, spent, kept: income - spent, hasSpending }
}

// The N cycles before `current`, most recent first.
export function previousCycles(current: Cycle, cycleStartDay: number, n: number): Cycle[] {
  const out: Cycle[] = []
  for (let i = 1; i <= n; i++) out.push(shiftCycle(current, cycleStartDay, -i))
  return out
}

// Average spending over completed months that actually have records — so a
// month with no data can't drag the average down and overstate how long
// savings would last.
export function averageMonthlySpend(months: CycleKept[]): number {
  const withData = months.filter((m) => m.hasSpending)
  if (withData.length === 0) return 0
  return withData.reduce((s, m) => s + m.spent, 0) / withData.length
}

// How long a sum would last at a monthly rate.
export function coverage(amount: number, perMonth: number): { months: number; days: number } | null {
  if (amount <= 0 || perMonth <= 0) return null
  const months = amount / perMonth
  return { months, days: Math.floor(months * 30.4) }
}

// ---- Wins feed ----

export interface Win {
  id: string
  date: string
  amount: number
  kind: 'payment' | 'investment'
  title: string // e.g. client/invoice note, or "Invested"
  subtitle: string // stream or asset name
}

// Money coming in and money going into investments, as dated events — the
// counterpart to the expense list. Contributions are derived from the asset's
// schedule, never stored, so they can't double up across devices.
export function winsBetween(
  start: string,
  end: string,
  payments: IncomePayment[],
  sources: IncomeSource[],
  assets: Asset[],
): Win[] {
  const sourceName = new Map(sources.map((s) => [s.id, s.name]))
  const wins: Win[] = []
  for (const p of payments) {
    if (p.deleted || p.date < start || p.date > end) continue
    const stream = sourceName.get(p.sourceId) ?? 'Income'
    wins.push({ id: `pay:${p.id}`, date: p.date, amount: p.amount, kind: 'payment', title: p.note || stream, subtitle: stream })
  }
  for (const a of assets) {
    for (const date of contributionDates(a, start, end)) {
      wins.push({
        id: `inv:${a.id}:${date}`,
        date,
        amount: a.monthlyAdd ?? 0,
        kind: 'investment',
        title: 'Invested',
        subtitle: a.name,
      })
    }
  }
  return wins.sort((x, y) => (x.date === y.date ? y.amount - x.amount : y.date.localeCompare(x.date)))
}

// How much of the "Just for me" fund has been enjoyed in a range.
export function forMeSpent(txns: Transaction[], categoryId: string | undefined, start: string, end: string): number {
  if (!categoryId) return 0
  let sum = 0
  for (const t of txns) {
    if (!t.deleted && t.categoryId === categoryId && t.date >= start && t.date <= end) sum += t.amount
  }
  return sum
}
// Always rounds DOWN, so reassurance is never overstated: 6.9 months → "6.5
// months". Under 2 months it's shown in days instead.
export function describeCover(c: { months: number; days: number }): string {
  if (c.months < 2) return `${c.days} days`
  const m = c.months >= 10 ? Math.floor(c.months) : Math.floor(c.months * 2) / 2
  return `${m % 1 === 0 ? m : m.toFixed(1)} months`
}
