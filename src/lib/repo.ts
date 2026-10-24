import { db, uid } from '../db'
import type {
  Account,
  Category,
  RecurringRule,
  Settings,
  Transaction,
  IncomeSource,
  IncomeOverride,
  IncomePayment,
  Asset,
  AssetKind,
  Wellbeing,
} from './types'
import { overrideId } from './income'
import { getCycle, shiftCycle } from './cycle'
import { fromISO, todayISO } from './format'
import { addDaysISO, assetValue } from './wins'
import { queuePush } from './sync'

// All writes funnel through here so we can (a) stamp updatedAt, (b) soft-delete
// for sync, and (c) enqueue the change for Supabase once online mode is on.

const now = () => Date.now()

// ---- Transactions ----
export interface NewTransaction {
  id?: string // caller-supplied id for idempotent writes (e.g. recurring posts)
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
    id: input.id ?? uid(),
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
  const existing = input.id ? await db.incomeSources.get(input.id) : undefined
  const src: IncomeSource = {
    id: input.id ?? uid(),
    name: input.name,
    defaultAmount: input.defaultAmount,
    color: input.color,
    active: input.active ?? true,
    // Keep the payment-tracking flag unless explicitly changed.
    trackPayments: input.trackPayments ?? existing?.trackPayments,
    updatedAt: now(),
  }
  await db.incomeSources.put(src)
  queuePush('incomeSources', src)
  return src
}

// Switch a stream between a fixed monthly figure and logged payments. Tracked
// streams ignore the default, so when turning tracking on we first write the
// default into every month up to and including this one that was relying on
// it — history stays exactly as it displayed, and this month's running figure
// becomes the opening amount that new payments add to. Future months start
// from zero and build up from payments.
export async function setTrackPayments(sourceId: string, on: boolean): Promise<void> {
  const src = await db.incomeSources.get(sourceId)
  // Strict compare: a never-decided stream (undefined) still gets an explicit
  // true/false stored, so the + screen knows whether to add or set.
  if (!src || src.trackPayments === on) return

  if (on && src.defaultAmount > 0) {
    const settings = await db.settings.get('singleton')
    const startDay = settings?.cycleStartDay ?? 1
    const current = getCycle(startDay)
    const first = await db.transactions.orderBy('date').first()
    let c = first ? getCycle(startDay, fromISO(first.date)) : current
    if (c.key > current.key) c = current
    for (let guard = 0; c.key <= current.key && guard < 240; guard++) {
      const existing = await db.incomeOverrides.get(overrideId(sourceId, c.key))
      if (!existing || existing.deleted) await setIncomeOverride(sourceId, c.key, src.defaultAmount)
      c = shiftCycle(c, startDay, 1)
    }
  }

  const updated: IncomeSource = { ...src, trackPayments: on, updatedAt: now() }
  await db.incomeSources.put(updated)
  queuePush('incomeSources', updated)
}

// ---- Income payments ----
export async function addIncomePayment(input: {
  sourceId: string
  date: string
  amount: number
  note?: string
}): Promise<IncomePayment> {
  // Logging a payment implies the stream is payment-tracked.
  await setTrackPayments(input.sourceId, true)
  const t = now()
  const row: IncomePayment = {
    id: uid(),
    sourceId: input.sourceId,
    date: input.date,
    amount: input.amount,
    note: input.note?.trim() ?? '',
    createdAt: t,
    updatedAt: t,
  }
  await db.incomePayments.put(row)
  queuePush('incomePayments', row)
  return row
}

export async function updateIncomePayment(
  id: string,
  patch: Partial<Pick<IncomePayment, 'date' | 'amount' | 'note'>>,
): Promise<void> {
  const existing = await db.incomePayments.get(id)
  if (!existing) return
  const updated: IncomePayment = { ...existing, ...patch, id, updatedAt: now() }
  await db.incomePayments.put(updated)
  queuePush('incomePayments', updated)
}

export async function deleteIncomePayment(id: string): Promise<void> {
  const existing = await db.incomePayments.get(id)
  if (!existing) return
  const updated: IncomePayment = { ...existing, deleted: true, updatedAt: now() }
  await db.incomePayments.put(updated)
  queuePush('incomePayments', updated)
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

// ---- Assets (savings, investments, net worth) ----

// Save an asset from what the user sees: its CURRENT value and schedule. If the
// value or the automatic monthly contribution changed, the figure is re-based on
// today, so contributions already counted are never counted twice. Contributions
// start the day after they're switched on (today's value already includes today).
export async function saveAsset(input: {
  id?: string
  name: string
  kind: AssetKind
  value: number
  monthlyAdd?: number
  addDay?: number
  inSafetyNet?: boolean
  color: string
}): Promise<Asset> {
  const today = todayISO()
  const existing = input.id ? await db.assets.get(input.id) : undefined
  const monthlyAdd = input.kind === 'debt' ? 0 : Math.max(input.monthlyAdd ?? 0, 0)
  const addDay = monthlyAdd > 0 ? Math.min(Math.max(Math.round(input.addDay ?? 1), 1), 31) : undefined

  let amount = input.value
  let asOf = today
  if (existing) {
    const unchanged =
      Math.abs(assetValue(existing, today) - input.value) < 0.005 &&
      (existing.monthlyAdd ?? 0) === monthlyAdd &&
      (existing.addDay ?? undefined) === addDay
    if (unchanged) {
      amount = existing.amount
      asOf = existing.asOf
    }
  }
  const addSince =
    monthlyAdd > 0 ? (existing?.monthlyAdd && existing.addSince ? existing.addSince : addDaysISO(today, 1)) : undefined

  const row: Asset = {
    id: existing?.id ?? uid(),
    name: input.name,
    kind: input.kind,
    amount,
    asOf,
    monthlyAdd: monthlyAdd > 0 ? monthlyAdd : undefined,
    addDay,
    addSince,
    inSafetyNet: input.kind === 'investment' ? !!input.inSafetyNet : undefined,
    color: input.color,
    updatedAt: now(),
  }
  await db.assets.put(row)
  queuePush('assets', row)
  return row
}

// Quick update of just the value (e.g. after checking a statement or withdrawing).
export async function setAssetValue(id: string, value: number): Promise<void> {
  const existing = await db.assets.get(id)
  if (!existing) return
  const row: Asset = { ...existing, amount: value, asOf: todayISO(), updatedAt: now() }
  await db.assets.put(row)
  queuePush('assets', row)
}

export async function deleteAsset(id: string): Promise<void> {
  const existing = await db.assets.get(id)
  if (!existing) return
  const row: Asset = { ...existing, deleted: true, updatedAt: now() }
  await db.assets.put(row)
  queuePush('assets', row)
}

// ---- Wellbeing preferences ----
export const DEFAULT_WELLBEING: Wellbeing = {
  id: 'singleton',
  forMeMonthly: 0,
  emergencyLabel: '',
  emergencyAmount: 0,
  updatedAt: 0,
}

export async function saveWellbeing(patch: Partial<Wellbeing>): Promise<void> {
  const existing = (await db.wellbeing.get('singleton')) ?? DEFAULT_WELLBEING
  const row: Wellbeing = { ...existing, ...patch, id: 'singleton', updatedAt: now() }
  await db.wellbeing.put(row)
  queuePush('wellbeing', row)
}

// The category whose spending draws from the "Just for me" fund. Reuses one
// named "Just for me" if it exists (e.g. created on another device), otherwise
// creates it — so there's never more than one.
export async function ensureForMeCategory(): Promise<string> {
  const all = await db.categories.toArray()
  const found = all.find((c) => !c.archived && c.name.trim().toLowerCase() === 'just for me')
  if (found) return found.id
  const cat = await upsertCategory({ name: 'Just for me', group: 'discretionary', color: '#ec4899', icon: '💛', monthlyBudget: 0 })
  return cat.id
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
