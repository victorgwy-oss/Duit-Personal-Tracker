import type { RecurringRule } from './types'
import { fromISO, toISO, todayISO } from './format'

// A rule that has passed its end date no longer posts and shouldn't count as a
// live commitment.
export function hasEnded(rule: RecurringRule, on: string = todayISO()): boolean {
  return !!rule.endDate && rule.endDate < on
}

// Compute the calendar dates a rule "fires" on within [startISO, endISO].
// This is the single source of truth used by both the dashboard projection
// (what's still coming this cycle) and the auto-post engine (what to insert).
export function occurrencesInRange(
  rule: RecurringRule,
  startISO: string,
  endISO: string,
): string[] {
  const start = fromISO(startISO)
  let end = fromISO(endISO)
  const ruleStart = fromISO(rule.startDate)
  // A rule with an end date stops after it (e.g. a 12-month installment).
  if (rule.endDate) {
    const ruleEnd = fromISO(rule.endDate)
    if (ruleEnd < end) end = ruleEnd
  }
  const out: string[] = []

  // Never fire before the rule's own start date.
  const from = ruleStart > start ? ruleStart : start
  if (from > end) return out

  if (rule.cadence === 'weekly') {
    const targetDow = ((rule.dayOfMonth % 7) + 7) % 7 // reuse field as day-of-week
    const d = new Date(from)
    while (d <= end) {
      if (d.getDay() === targetDow) out.push(toISO(d))
      d.setDate(d.getDate() + 1)
    }
    return out
  }

  if (rule.cadence === 'monthly') {
    // Walk month by month, clamping the target day to each month's length.
    const d = new Date(from.getFullYear(), from.getMonth(), 1)
    while (d <= end) {
      const day = clampToMonth(d.getFullYear(), d.getMonth(), rule.dayOfMonth)
      const occ = new Date(d.getFullYear(), d.getMonth(), day)
      if (occ >= from && occ <= end && occ >= ruleStart) out.push(toISO(occ))
      d.setMonth(d.getMonth() + 1)
    }
    return out
  }

  // annual: same month/day as startDate, each year in range.
  const m = ruleStart.getMonth()
  for (let y = from.getFullYear(); y <= end.getFullYear(); y++) {
    const day = clampToMonth(y, m, ruleStart.getDate())
    const occ = new Date(y, m, day)
    if (occ >= from && occ <= end && occ >= ruleStart) out.push(toISO(occ))
  }
  return out
}

function clampToMonth(year: number, month: number, day: number): number {
  const last = new Date(year, month + 1, 0).getDate()
  return Math.min(Math.max(day, 1), last)
}

// Date of the n-th occurrence (1-based), ignoring any end date. Used by the
// editor's "for N payments" mode to compute the end date of an installment.
export function nthOccurrence(rule: RecurringRule, n: number): string | null {
  if (n < 1) return null
  const start = fromISO(rule.startDate)
  const window = new Date(start)
  if (rule.cadence === 'weekly') window.setDate(window.getDate() + (n + 2) * 7)
  else if (rule.cadence === 'monthly') window.setMonth(window.getMonth() + (n + 2))
  else window.setFullYear(window.getFullYear() + (n + 2))
  const occ = occurrencesInRange({ ...rule, endDate: undefined }, rule.startDate, toISO(window))
  return occ[n - 1] ?? null
}

// What one rule costs in an average month, normalising weekly and annual
// charges so they can be summed into a single "fixed cost per month" figure.
export function monthlyEquivalent(rule: RecurringRule): number {
  if (rule.cadence === 'weekly') return (rule.amount * 52) / 12
  if (rule.cadence === 'annual') return rule.amount / 12
  return rule.amount
}

// Sum of the monthly-equivalent cost of every active, live rule.
export function monthlyCommitment(rules: RecurringRule[]): number {
  return rules
    .filter((r) => r.active && !r.deleted && !hasEnded(r))
    .reduce((sum, r) => sum + monthlyEquivalent(r), 0)
}

export function cadenceLabel(rule: RecurringRule): string {
  const DOW = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
  if (rule.cadence === 'weekly') return `Every ${DOW[((rule.dayOfMonth % 7) + 7) % 7]}`
  if (rule.cadence === 'monthly') return `Monthly on day ${rule.dayOfMonth}`
  const d = fromISO(rule.startDate)
  const M = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
  return `Yearly on ${d.getDate()} ${M[d.getMonth()]}`
}
