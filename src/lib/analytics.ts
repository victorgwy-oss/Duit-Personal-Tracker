import type { Account, Category, Transaction, WalletType } from './types'
import { walletTypeLabel } from './types'
import { getCycle, shiftCycle, cycleStartISO, cycleEndISO, type Cycle } from './cycle'

// Aggregations for the Analytics tab. Everything is bucketed by the user's
// spending cycle (so a statement-aligned month lines up with the dashboard),
// then rolled up by month, category, and spending mode (wallet type).

export interface MonthPoint {
  cycle: Cycle
  total: number
}

export interface CategorySlice {
  category: Category
  spent: number
  share: number // 0..1 of the range total
}

export interface WalletTypeSlice {
  type: WalletType
  label: string
  color: string
  spent: number
  share: number
}

export interface Analytics {
  months: MonthPoint[] // oldest → newest
  rangeTotal: number
  rangeStartISO: string
  rangeEndISO: string
  avgPerMonth: number
  byCategory: CategorySlice[]
  byWalletType: WalletTypeSlice[]
  txnCount: number
}

// Colours for the four spending modes, matched to the wallet-type concept.
const WALLET_TYPE_COLOR: Record<WalletType, string> = {
  ewallet: '#22d3ee',
  card: '#f472b6',
  cash: '#84cc16',
  bank: '#0ea5e9',
}

export function buildCycles(cycleStartDay: number, months: number): Cycle[] {
  const base = getCycle(cycleStartDay)
  const out: Cycle[] = []
  for (let i = months - 1; i >= 0; i--) {
    out.push(i === 0 ? base : shiftCycle(base, cycleStartDay, -i))
  }
  return out
}

export function computeAnalytics(
  txns: Transaction[],
  categories: Category[],
  accounts: Account[],
  cycleStartDay: number,
  months: number,
  filterCategoryId: string | null,
): Analytics {
  const cycles = buildCycles(cycleStartDay, months)
  const rangeStartISO = cycleStartISO(cycles[0])
  const rangeEndISO = cycleEndISO(cycles[cycles.length - 1])
  const accountMap = new Map(accounts.map((a) => [a.id, a]))
  const catMap = new Map(categories.map((c) => [c.id, c]))

  const inRange = txns.filter(
    (t) =>
      !t.deleted &&
      t.date >= rangeStartISO &&
      t.date <= rangeEndISO &&
      (!filterCategoryId || t.categoryId === filterCategoryId),
  )

  // Monthly totals.
  const months_: MonthPoint[] = cycles.map((cycle) => {
    const s = cycleStartISO(cycle)
    const e = cycleEndISO(cycle)
    const total = inRange
      .filter((t) => t.date >= s && t.date <= e)
      .reduce((sum, t) => sum + t.amount, 0)
    return { cycle, total }
  })

  const rangeTotal = inRange.reduce((sum, t) => sum + t.amount, 0)

  // By category.
  const byCatMap = new Map<string, number>()
  for (const t of inRange) byCatMap.set(t.categoryId, (byCatMap.get(t.categoryId) ?? 0) + t.amount)
  const byCategory: CategorySlice[] = [...byCatMap.entries()]
    .map(([id, spent]) => ({ category: catMap.get(id), spent }))
    .filter((x): x is { category: Category; spent: number } => !!x.category && x.spent > 0)
    .map(({ category, spent }) => ({ category, spent, share: rangeTotal > 0 ? spent / rangeTotal : 0 }))
    .sort((a, b) => b.spent - a.spent)

  // By spending mode (wallet type).
  const byTypeMap = new Map<WalletType, number>()
  for (const t of inRange) {
    const type = accountMap.get(t.accountId)?.type
    if (!type) continue
    byTypeMap.set(type, (byTypeMap.get(type) ?? 0) + t.amount)
  }
  const byWalletType: WalletTypeSlice[] = [...byTypeMap.entries()]
    .filter(([, spent]) => spent > 0)
    .map(([type, spent]) => ({
      type,
      label: walletTypeLabel(type),
      color: WALLET_TYPE_COLOR[type],
      spent,
      share: rangeTotal > 0 ? spent / rangeTotal : 0,
    }))
    .sort((a, b) => b.spent - a.spent)

  // Even months with no spend count toward the average, so a quiet month
  // pulls the average down honestly.
  const avgPerMonth = months > 0 ? rangeTotal / months : 0

  return {
    months: months_,
    rangeTotal,
    rangeStartISO,
    rangeEndISO,
    avgPerMonth,
    byCategory,
    byWalletType,
    txnCount: inRange.length,
  }
}
