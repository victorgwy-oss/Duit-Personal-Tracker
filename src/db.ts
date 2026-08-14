import Dexie, { type Table } from 'dexie'
import type {
  Account,
  Category,
  Transaction,
  RecurringRule,
  Settings,
} from './lib/types'

// Local-first store. This is the single source the UI reads/writes.
// A sync layer (added in Phase F) reconciles this with Supabase in the
// background, so switching from local-only to online changes nothing here.
export class FinanceDB extends Dexie {
  accounts!: Table<Account, string>
  categories!: Table<Category, string>
  transactions!: Table<Transaction, string>
  recurring!: Table<RecurringRule, string>
  settings!: Table<Settings, string>

  constructor() {
    super('duit-finance')
    this.version(1).stores({
      accounts: 'id, name, type, archived',
      categories: 'id, name, group, archived',
      transactions: 'id, date, accountId, categoryId, source, reconciled, deleted',
      recurring: 'id, active, deleted',
      settings: 'id',
    })
  }
}

export const db = new FinanceDB()

export const uid = () => crypto.randomUUID()
const now = () => Date.now()

export const DEFAULT_SETTINGS: Settings = {
  id: 'singleton',
  monthlyIncome: 0,
  savingsTarget: 3000,
  currency: 'RM',
  cycleStartDay: 1,
  onboarded: false,
  updatedAt: 0,
}

// Seed the two wallets the user actually pays with, plus a starter category set
// built around the RM2,500 discretionary food budget they already track.
async function seed() {
  const count = await db.accounts.count()
  if (count > 0) return

  const t = now()
  const accounts: Account[] = [
    { id: uid(), name: 'TouchNGo', type: 'ewallet', color: '#3b82f6', updatedAt: t },
    { id: uid(), name: 'Credit Card', type: 'card', color: '#f472b6', updatedAt: t },
  ]

  const categories: Category[] = [
    { id: uid(), name: 'Food & Dining', group: 'discretionary', monthlyBudget: 2500, color: '#f59e0b', icon: '🍜', updatedAt: t },
    { id: uid(), name: 'Groceries', group: 'discretionary', monthlyBudget: 0, color: '#84cc16', icon: '🛒', updatedAt: t },
    { id: uid(), name: 'Transport', group: 'discretionary', monthlyBudget: 0, color: '#06b6d4', icon: '🚗', updatedAt: t },
    { id: uid(), name: 'Shopping', group: 'discretionary', monthlyBudget: 0, color: '#a855f7', icon: '🛍️', updatedAt: t },
    { id: uid(), name: 'Family', group: 'discretionary', monthlyBudget: 0, color: '#ec4899', icon: '👨‍👩‍👧', updatedAt: t },
    { id: uid(), name: 'Travel', group: 'discretionary', monthlyBudget: 0, color: '#14b8a6', icon: '✈️', updatedAt: t },
    { id: uid(), name: 'Insurance', group: 'fixed', monthlyBudget: 0, color: '#6366f1', icon: '🛡️', updatedAt: t },
    { id: uid(), name: 'Subscriptions', group: 'fixed', monthlyBudget: 0, color: '#8b5cf6', icon: '🔁', updatedAt: t },
    { id: uid(), name: 'Bills & Utilities', group: 'fixed', monthlyBudget: 0, color: '#0ea5e9', icon: '💡', updatedAt: t },
    { id: uid(), name: 'Rent / Loan', group: 'fixed', monthlyBudget: 0, color: '#64748b', icon: '🏠', updatedAt: t },
    { id: uid(), name: 'Other', group: 'other', monthlyBudget: 0, color: '#94a3b8', icon: '❓', updatedAt: t },
  ]

  await db.accounts.bulkAdd(accounts)
  await db.categories.bulkAdd(categories)
  await db.settings.put(DEFAULT_SETTINGS)
}

let seedPromise: Promise<void> | null = null
export function ensureSeeded() {
  if (!seedPromise) seedPromise = seed()
  return seedPromise
}
