import { db, uid } from '../db'
import type {
  Account,
  Category,
  RecurringRule,
  Settings,
  Transaction,
  IncomeSource,
  IncomeOverride,
} from './types'
import { overrideId } from './income'
import { queuePush } from './sync'

// All writes funnel through here so we can (a) stamp updatedAt, (b) soft-delete
// for sync, and (c) enqueue the change for Supabase once online mode is on.

const now = () => Date.now()

// ---- Transactions ----
export interface NewTransaction {
  date: string
  amount: number
  accountId: string
  categoryId: string
  note?: string
  source?: Transaction['source']
  recurringId?: string
  reconciled?: boolean
}

export async function addTransaction(input: NewTransaction): Promise<Transaction> {
  const t = now()
  const txn: Transaction = {
    id: uid(),
    date: input.date,
    amount: input.amount,
    accountId: input.accountId,
    categoryId: input.categoryId,
    note: input.note ?? '',
    source: input.source ?? 'manual',
    recurringId: input.recurringId,
    reconciled: input.reconciled ?? false,
    createdAt: t,
    updatedAt: t,
  }
  await db.transactions.put(txn)
  queuePush('transactions', txn)
  return txn
}

export async function updateTransaction(
  id: string,
  patch: Partial<Transaction>,
): Promise<void> {
  const existing = await db.transactions.get(id)
  if (!existing) return
  const updated = { ...existing, ...patch, id, updatedAt: now() }
  await db.transactions.put(updated)
  queuePush('transactions', updated)
}

export async function deleteTransaction(id: string): Promise<void> {
  const existing = await db.transactions.get(id)
  if (!existing) return
  const updated = { ...existing, deleted: true, updatedAt: now() }
  await db.transactions.put(updated)
  queuePush('transactions', updated)
}

// ---- Accounts ----
export async function upsertAccount(input: Partial<Account> & { name: string; type: Account['type']; color: string }): Promise<Account> {
  const acc: Account = {
    id: input.id ?? uid(),
    name: input.name,
    type: input.type,
    color: input.color,
    archived: input.archived,
    updatedAt: now(),
  }
  await db.accounts.put(acc)
  queuePush('accounts', acc)
  return acc
}

// ---- Categories ----
export async function upsertCategory(
  input: Partial<Category> & { name: string; group: Category['group']; color: string; icon: string },
): Promise<Category> {
  const cat: Category = {
    id: input.id ?? uid(),
    name: input.name,
    group: input.group,
    monthlyBudget: input.monthlyBudget ?? 0,
    color: input.color,
    icon: input.icon,
    archived: input.archived,
    updatedAt: now(),
  }
  await db.categories.put(cat)
  queuePush('categories', cat)
  return cat
}

// ---- Recurring ----
export async function upsertRecurring(rule: Omit<RecurringRule, 'updatedAt'>): Promise<RecurringRule> {
  const r: RecurringRule = { ...rule, updatedAt: now() }
  await db.recurring.put(r)
  queuePush('recurring', r)
  return r
}

export async function deleteRecurring(id: string): Promise<void> {
  const existing = await db.recurring.get(id)
  if (!existing) return
  const updated = { ...existing, deleted: true, active: false, updatedAt: now() }
  await db.recurring.put(updated)
  queuePush('recurring', updated)
}

// ---- Income sources ----
export async function upsertIncomeSource(
  input: Partial<IncomeSource> & { name: string; defaultAmount: number; color: string },
): Promise<IncomeSource> {
  const src: IncomeSource = {
    id: input.id ?? uid(),
    name: input.name,
    defaultAmount: input.defaultAmount,
    color: input.color,
    active: input.active ?? true,
    updatedAt: now(),
  }
  await db.incomeSources.put(src)
  queuePush('incomeSources', src)
  return src
}

export async function deleteIncomeSource(id: string): Promise<void> {
  const existing = await db.incomeSources.get(id)
  if (!existing) return
  const updated = { ...existing, deleted: true, active: false, updatedAt: now() }
  await db.incomeSources.put(updated)
  queuePush('incomeSources', updated)
}

// Set (or update) the amount for one source in one month. Passing `null` clears
// the override so the source falls back to its default amount.
export async function setIncomeOverride(
  sourceId: string,
  monthKey: string,
  amount: number | null,
): Promise<void> {
  const id = overrideId(sourceId, monthKey)
  if (amount == null) {
    const existing = await db.incomeOverrides.get(id)
    if (!existing) return
    const updated = { ...existing, deleted: true, updatedAt: now() }
    await db.incomeOverrides.put(updated)
    queuePush('incomeOverrides', updated)
    return
  }
  const row: IncomeOverride = { id, sourceId, monthKey, amount, updatedAt: now() }
  await db.incomeOverrides.put(row)
  queuePush('incomeOverrides', row)
}

// ---- Settings ----
export async function saveSettings(patch: Partial<Settings>): Promise<void> {
  const existing = await db.settings.get('singleton')
  const base: Settings = existing ?? {
    id: 'singleton',
    monthlyIncome: 0,
    savingsTarget: 3000,
    currency: 'RM',
    cycleStartDay: 1,
    onboarded: false,
    updatedAt: 0,
  }
  const updated: Settings = { ...base, ...patch, id: 'singleton', updatedAt: now() }
  await db.settings.put(updated)
  queuePush('settings', updated)
}
