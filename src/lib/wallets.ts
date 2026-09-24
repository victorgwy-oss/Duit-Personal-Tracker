import type { Account, Transaction } from './types'

// The wallet pre-selected when logging an expense. Touch 'n Go is the user's
// everyday wallet, so it leads; everything else follows by how often it's
// actually chosen when entering expenses by hand.
const PREFERRED = /touch\s*'?\s*n\s*'?\s*go|\btng\b/i

export function orderAccountsByUsage(accounts: Account[], txns: Transaction[] | undefined): Account[] {
  // Count only hand-entered expenses from the last 6 months, so auto-posted
  // bills and old imports don't outweigh what you tap day to day.
  const since = new Date()
  since.setMonth(since.getMonth() - 6)
  const sinceISO = since.toISOString().slice(0, 10)
  const counts = new Map<string, number>()
  for (const t of txns ?? []) {
    if (t.deleted || t.source !== 'manual' || t.date < sinceISO) continue
    counts.set(t.accountId, (counts.get(t.accountId) ?? 0) + 1)
  }
  const rank = (a: Account) => (PREFERRED.test(a.name) ? 1 : 0)
  return accounts.slice().sort((a, b) => {
    if (rank(a) !== rank(b)) return rank(b) - rank(a)
    const diff = (counts.get(b.id) ?? 0) - (counts.get(a.id) ?? 0)
    return diff !== 0 ? diff : a.name.localeCompare(b.name)
  })
}
