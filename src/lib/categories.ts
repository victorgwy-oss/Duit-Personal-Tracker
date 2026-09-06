import type { Category, Transaction } from './types'

// Order categories so the ones you actually use most sit first — the fastest
// thing to tap when logging an expense. Ties (and never-used categories) fall
// back to alphabetical, so the list stays predictable.
export function orderCategoriesByUsage(
  categories: Category[],
  txns: Transaction[] | undefined,
): Category[] {
  const counts = new Map<string, number>()
  for (const t of txns ?? []) {
    if (t.deleted) continue
    counts.set(t.categoryId, (counts.get(t.categoryId) ?? 0) + 1)
  }
  return categories.slice().sort((a, b) => {
    const diff = (counts.get(b.id) ?? 0) - (counts.get(a.id) ?? 0)
    return diff !== 0 ? diff : a.name.localeCompare(b.name)
  })
}
