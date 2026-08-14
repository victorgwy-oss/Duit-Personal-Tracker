// Core domain types. IDs are UUID strings so they map 1:1 onto Supabase later.

export type WalletType = 'ewallet' | 'card'

export interface Account {
  id: string
  name: string
  type: WalletType
  color: string
  archived?: boolean
  updatedAt: number
}

export type CategoryGroup = 'fixed' | 'discretionary' | 'other'

export interface Category {
  id: string
  name: string
  group: CategoryGroup
  monthlyBudget: number // 0 = no budget
  color: string
  icon: string // emoji
  archived?: boolean
  updatedAt: number
}

export type TxnSource = 'manual' | 'recurring' | 'import'

export interface Transaction {
  id: string
  date: string // ISO yyyy-mm-dd (local calendar day of spend)
  amount: number // positive = money out (expense). Negative = refund/income adjustment.
  accountId: string
  categoryId: string
  note: string
  source: TxnSource
  recurringId?: string
  reconciled: boolean // true once matched to a statement import
  createdAt: number
  updatedAt: number
  deleted?: boolean // soft delete for sync
}

export type Cadence = 'weekly' | 'monthly' | 'annual'
export type RecurringMode = 'auto' | 'confirm'

export interface RecurringRule {
  id: string
  name: string
  amount: number
  accountId: string
  categoryId: string
  cadence: Cadence
  dayOfMonth: number // for monthly/annual: 1-31; for weekly: 0-6 (day of week)
  startDate: string // ISO yyyy-mm-dd
  active: boolean
  mode: RecurringMode
  lastPostedPeriod: string | null // period key already posted, e.g. "2026-08"
  updatedAt: number
  deleted?: boolean
}

export interface Settings {
  id: 'singleton'
  monthlyIncome: number
  savingsTarget: number
  currency: string
  cycleStartDay: number // 1 = calendar month; else statement-aligned day
  onboarded: boolean
  updatedAt: number
}
