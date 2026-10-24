// Core domain types. IDs are UUID strings so they map 1:1 onto Supabase later.

export type WalletType = 'ewallet' | 'card' | 'cash' | 'bank'

export const WALLET_TYPES: { value: WalletType; label: string }[] = [
  { value: 'ewallet', label: 'E-wallet' },
  { value: 'card', label: 'Credit card' },
  { value: 'cash', label: 'Cash' },
  { value: 'bank', label: 'Bank transfer' },
]

export function walletTypeLabel(t: WalletType): string {
  return WALLET_TYPES.find((w) => w.value === t)?.label ?? t
}

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
  receiptPath?: string // storage path or data: URL of an attached receipt image
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
  endDate?: string // ISO yyyy-mm-dd; last day a charge may post. Absent = repeats forever (e.g. a fixed-term installment)
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

// A recurring stream of money in — salary, rent, business revenue, etc.
// `defaultAmount` is what it earns in a typical month; individual months can be
// overridden (see IncomeOverride) for streams that fluctuate.
export interface IncomeSource {
  id: string
  name: string
  defaultAmount: number
  color: string
  active: boolean
  // Built from logged payments (e.g. business revenue) rather than a fixed
  // monthly figure. Its month total = any amount set manually + payments.
  trackPayments?: boolean
  updatedAt: number
  deleted?: boolean
}

// Something you own (or owe) — savings, investments, property, a loan. Together
// they make up your net worth: the "wins" side of the picture, shown alongside
// spending. `amount` is the value you last entered; a monthly contribution (e.g.
// an investment DCA) is added on automatically each month after `asOf`, so the
// figure keeps growing on its own until you next correct it.
export type AssetKind = 'savings' | 'investment' | 'property' | 'other' | 'debt'

export interface Asset {
  id: string
  name: string
  kind: AssetKind // 'savings' counts as your safety net; 'debt' is subtracted
  amount: number // value as of `asOf` (what you last entered)
  asOf: string // ISO date that amount was entered
  monthlyAdd?: number // automatic monthly contribution, e.g. an investment DCA
  addDay?: number // day of the month it goes in (1–31)
  addSince?: string // ISO date contributions start counting (for the history)
  inSafetyNet?: boolean // an investment you could reach in an emergency (savings always count)
  group?: string // what it's part of, e.g. several funds under "Eastspring"
  color: string
  updatedAt: number
  deleted?: boolean
}

// Personal, gentler-money preferences. One row per user.
export interface Wellbeing {
  id: 'singleton'
  forMeMonthly: number // pre-approved monthly "Just for me" amount (0 = off)
  forMeCategoryId?: string // category whose spending draws from it
  emergencyLabel: string // a past money emergency to compare against, e.g. "Gearbox"
  emergencyAmount: number // what it cost (0 = not set)
  updatedAt: number
}

// One payment received on a payment-tracked income stream — e.g. a client
// paying an invoice. The stream's monthly income sums these automatically.
export interface IncomePayment {
  id: string
  sourceId: string
  date: string // ISO yyyy-mm-dd the money came in
  amount: number
  note: string // client / invoice reference (optional)
  createdAt: number
  updatedAt: number
  deleted?: boolean
}

// Per-month amount for one income source, keyed to a cycle month ("2026-08").
// Its presence means the user set a specific figure for that month; absence
// means the source's defaultAmount applies.
export interface IncomeOverride {
  id: string // `${sourceId}:${monthKey}`
  sourceId: string
  monthKey: string // cycle key, e.g. "2026-08"
  amount: number
  updatedAt: number
  deleted?: boolean
}
