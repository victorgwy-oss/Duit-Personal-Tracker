import type { Account, Category, RecurringRule, Settings, Transaction } from './types'
import { type Cycle, cycleProgress, cycleStartISO, cycleEndISO } from './cycle'
import { occurrencesInRange } from './recurring'
import { todayISO } from './format'

export interface CategorySpend {
  category: Category
  spent: number
  budget: number
}

export interface UpcomingCharge {
  rule: RecurringRule
  date: string
  amount: number
}

export interface DashboardData {
  totalSpent: number
  perWallet: { account: Account; spent: number }[]
  cardBalance: number // accruing spend on card-type wallets this cycle
  ewalletSpent: number
  discretionarySpent: number
  fixedSpent: number
  byCategory: CategorySpend[]
  // Recurring charges due within this cycle that haven't been posted yet.
  upcoming: UpcomingCharge[]
  remainingRecurring: number
  // Projection
  projectedRemainingVariable: number
  projectedTotalSpend: number
  projectedSavings: number // if spending continues at current run-rate
  savingsIfStopNow: number // income − spent so far − committed recurring
  savingsTarget: number
  daysLeft: number
  onTrack: boolean
}

export function computeDashboard(
  txns: Transaction[],
  categories: Category[],
  accounts: Account[],
  recurring: RecurringRule[],
  settings: Settings,
  cycle: Cycle,
): DashboardData {
  const catMap = new Map(categories.map((c) => [c.id, c]))
  const active = txns.filter((t) => !t.deleted)

  // Expenses are positive amounts. Refunds (negative) net down the totals.
  const totalSpent = sum(active.map((t) => t.amount))

  const perWallet = accounts.map((account) => ({
    account,
    spent: sum(active.filter((t) => t.accountId === account.id).map((t) => t.amount)),
  }))

  const cardBalance = sum(
    active
      .filter((t) => accounts.find((a) => a.id === t.accountId)?.type === 'card')
      .map((t) => t.amount),
  )
  const ewalletSpent = totalSpent - cardBalance

  let discretionarySpent = 0
  let fixedSpent = 0
  const spendByCat = new Map<string, number>()
  for (const t of active) {
    spendByCat.set(t.categoryId, (spendByCat.get(t.categoryId) ?? 0) + t.amount)
    const g = catMap.get(t.categoryId)?.group
    if (g === 'fixed') fixedSpent += t.amount
    else if (g === 'discretionary') discretionarySpent += t.amount
  }

  const byCategory: CategorySpend[] = categories
    .map((category) => ({
      category,
      spent: spendByCat.get(category.id) ?? 0,
      budget: category.monthlyBudget,
    }))
    .filter((c) => c.spent > 0 || c.budget > 0)
    .sort((a, b) => b.spent - a.spent)

  // Recurring still to come this cycle: expected occurrences minus what's posted.
  const startISO = cycleStartISO(cycle)
  const endISO = cycleEndISO(cycle)
  const today = todayISO()
  const postedByRule = new Map<string, number>()
  for (const t of active) {
    if (t.recurringId) postedByRule.set(t.recurringId, (postedByRule.get(t.recurringId) ?? 0) + 1)
  }

  const upcoming: UpcomingCharge[] = []
  for (const rule of recurring) {
    if (!rule.active || rule.deleted) continue
    const occ = occurrencesInRange(rule, startISO, endISO)
    const postedCount = postedByRule.get(rule.id) ?? 0
    // Any occurrences beyond what's already posted are still "due".
    const dueDates = occ.slice(postedCount)
    for (const date of dueDates) {
      upcoming.push({ rule, date, amount: rule.amount })
    }
  }
  upcoming.sort((a, b) => a.date.localeCompare(b.date))
  const remainingRecurring = sum(upcoming.map((u) => u.amount))

  // Variable (discretionary) run-rate projection for the rest of the cycle.
  const { daysElapsed, daysLeft } = cycleProgress(cycle)
  const dailyVariable = daysElapsed > 0 ? discretionarySpent / daysElapsed : 0
  const projectedRemainingVariable = Math.max(dailyVariable * daysLeft, 0)

  const projectedTotalSpend = totalSpent + remainingRecurring + projectedRemainingVariable
  const income = settings.monthlyIncome
  const projectedSavings = income - projectedTotalSpend
  const savingsIfStopNow = income - totalSpent - remainingRecurring
  const savingsTarget = settings.savingsTarget

  // Upcoming that is genuinely in the future (for the "committed" card).
  const futureUpcoming = upcoming.filter((u) => u.date >= today)

  return {
    totalSpent,
    perWallet,
    cardBalance,
    ewalletSpent,
    discretionarySpent,
    fixedSpent,
    byCategory,
    upcoming: futureUpcoming,
    remainingRecurring,
    projectedRemainingVariable,
    projectedTotalSpend,
    projectedSavings,
    savingsIfStopNow,
    savingsTarget,
    daysLeft,
    onTrack: projectedSavings >= savingsTarget,
  }
}

function sum(nums: number[]): number {
  return nums.reduce((a, b) => a + b, 0)
}
