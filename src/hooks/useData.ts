import { useLiveQuery } from 'dexie-react-hooks'
import { db, DEFAULT_SETTINGS } from '../db'
import type { Account, Category } from '../lib/types'

export function useSettings() {
  return useLiveQuery(async () => {
    const s = await db.settings.get('singleton')
    return s ?? DEFAULT_SETTINGS
  }, [])
}

export function useAccounts(): Account[] | undefined {
  return useLiveQuery(
    () => db.accounts.filter((a) => !a.archived).toArray(),
    [],
  )
}

export function useCategories(): Category[] | undefined {
  return useLiveQuery(
    () => db.categories.filter((c) => !c.archived).toArray(),
    [],
  )
}

export function useAllTransactions() {
  return useLiveQuery(
    () => db.transactions.filter((t) => !t.deleted).toArray(),
    [],
  )
}

// Transactions falling inside a date range (inclusive ISO bounds).
export function useTransactionsInRange(startISO: string, endISO: string) {
  return useLiveQuery(
    () =>
      db.transactions
        .where('date')
        .between(startISO, endISO, true, true)
        .filter((t) => !t.deleted)
        .toArray(),
    [startISO, endISO],
  )
}

export function useRecurring() {
  return useLiveQuery(
    () => db.recurring.filter((r) => !r.deleted).toArray(),
    [],
  )
}

// Lookup maps keyed by id, handy for rendering transaction rows.
export function useLookups() {
  const accounts = useAccounts()
  const categories = useCategories()
  const accountMap = new Map((accounts ?? []).map((a) => [a.id, a]))
  const categoryMap = new Map((categories ?? []).map((c) => [c.id, c]))
  return { accounts, categories, accountMap, categoryMap }
}
