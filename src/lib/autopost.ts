import { db } from '../db'
import { addTransaction, upsertRecurring } from './repo'
import { occurrencesInRange } from './recurring'
import { todayISO } from './format'
import type { RecurringRule } from './types'

// Mirrors what the Supabase pg_cron job will do server-side in Phase F: post any
// recurring charge whose date has arrived but which hasn't been recorded yet.
// Idempotent by (recurringId, date) so running it repeatedly is safe.

const LOOKBACK_START = '2000-01-01'

async function postedDatesForRule(ruleId: string): Promise<Set<string>> {
  const rows = await db.transactions.filter((t) => t.recurringId === ruleId && !t.deleted).toArray()
  return new Set(rows.map((t) => t.date))
}

// Occurrences that are due (date <= today) but not yet posted.
export async function dueOccurrences(rule: RecurringRule): Promise<string[]> {
  const today = todayISO()
  const occ = occurrencesInRange(rule, LOOKBACK_START, today)
  const posted = await postedDatesForRule(rule.id)
  return occ.filter((d) => !posted.has(d))
}

async function postRule(rule: RecurringRule): Promise<number> {
  const due = await dueOccurrences(rule)
  for (const date of due) {
    await addTransaction({
      date,
      amount: rule.amount,
      accountId: rule.accountId,
      categoryId: rule.categoryId,
      note: rule.name,
      source: 'recurring',
      recurringId: rule.id,
    })
  }
  if (due.length > 0) {
    const period = todayISO().slice(0, 7)
    await upsertRecurring({ ...rule, lastPostedPeriod: period })
  }
  return due.length
}

// Run on app open. Auto-mode rules post silently; confirm-mode rules are left
// for the user to approve in the Recurring screen's review tray.
export async function runAutoPost(): Promise<number> {
  const rules = await db.recurring.filter((r) => r.active && !r.deleted && r.mode === 'auto').toArray()
  let posted = 0
  for (const rule of rules) {
    posted += await postRule(rule)
  }
  return posted
}

// For the review tray: confirm-mode rules with due (unposted) occurrences.
export interface PendingConfirm {
  rule: RecurringRule
  dates: string[]
  total: number
}

export async function pendingConfirmations(): Promise<PendingConfirm[]> {
  const rules = await db.recurring.filter((r) => r.active && !r.deleted && r.mode === 'confirm').toArray()
  const out: PendingConfirm[] = []
  for (const rule of rules) {
    const dates = await dueOccurrences(rule)
    if (dates.length > 0) out.push({ rule, dates, total: dates.length * rule.amount })
  }
  return out
}

export async function confirmPending(rule: RecurringRule, dates: string[]): Promise<void> {
  for (const date of dates) {
    await addTransaction({
      date,
      amount: rule.amount,
      accountId: rule.accountId,
      categoryId: rule.categoryId,
      note: rule.name,
      source: 'recurring',
      recurringId: rule.id,
    })
  }
}

// Skip a due occurrence (e.g. cancelled subscription) by writing a zero-amount
// tombstone transaction so it won't be re-proposed.
export async function skipPending(rule: RecurringRule, date: string): Promise<void> {
  await addTransaction({
    date,
    amount: 0,
    accountId: rule.accountId,
    categoryId: rule.categoryId,
    note: `${rule.name} (skipped)`,
    source: 'recurring',
    recurringId: rule.id,
  })
}
