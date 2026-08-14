import { db, ensureSeeded } from '../db'
import { supabase } from './supabase'
import { SUPABASE_URL, SUPABASE_ANON_KEY, isOnlineMode } from './config'

export { SUPABASE_URL, SUPABASE_ANON_KEY, isOnlineMode }

export type SyncTable = 'transactions' | 'accounts' | 'categories' | 'recurring' | 'settings'

// --- Table mapping between the local (camelCase) store and Postgres (snake_case) ---
interface TableConfig {
  remote: string
  dexie: () => any
  toRemote: (row: any, userId: string) => any
  fromRemote: (row: any) => any
}

const num = (v: any) => (v == null ? 0 : Number(v))

const TABLES: Record<SyncTable, TableConfig> = {
  accounts: {
    remote: 'accounts',
    dexie: () => db.accounts,
    toRemote: (r, uid) => ({ id: r.id, user_id: uid, name: r.name, type: r.type, color: r.color, archived: !!r.archived, updated_at: r.updatedAt }),
    fromRemote: (x) => ({ id: x.id, name: x.name, type: x.type, color: x.color, archived: !!x.archived, updatedAt: num(x.updated_at) }),
  },
  categories: {
    remote: 'categories',
    dexie: () => db.categories,
    toRemote: (r, uid) => ({ id: r.id, user_id: uid, name: r.name, group: r.group, monthly_budget: r.monthlyBudget, color: r.color, icon: r.icon, archived: !!r.archived, updated_at: r.updatedAt }),
    fromRemote: (x) => ({ id: x.id, name: x.name, group: x.group, monthlyBudget: num(x.monthly_budget), color: x.color, icon: x.icon, archived: !!x.archived, updatedAt: num(x.updated_at) }),
  },
  transactions: {
    remote: 'transactions',
    dexie: () => db.transactions,
    toRemote: (r, uid) => ({ id: r.id, user_id: uid, date: r.date, amount: r.amount, account_id: r.accountId, category_id: r.categoryId, note: r.note, source: r.source, recurring_id: r.recurringId ?? null, reconciled: !!r.reconciled, created_at: r.createdAt, updated_at: r.updatedAt, deleted: !!r.deleted }),
    fromRemote: (x) => ({ id: x.id, date: x.date, amount: Number(x.amount), accountId: x.account_id, categoryId: x.category_id, note: x.note ?? '', source: x.source, recurringId: x.recurring_id ?? undefined, reconciled: !!x.reconciled, createdAt: num(x.created_at), updatedAt: num(x.updated_at), deleted: !!x.deleted }),
  },
  recurring: {
    remote: 'recurring_rules',
    dexie: () => db.recurring,
    toRemote: (r, uid) => ({ id: r.id, user_id: uid, name: r.name, amount: r.amount, account_id: r.accountId, category_id: r.categoryId, cadence: r.cadence, day_of_month: r.dayOfMonth, start_date: r.startDate, active: !!r.active, mode: r.mode, last_posted_period: r.lastPostedPeriod ?? null, updated_at: r.updatedAt, deleted: !!r.deleted }),
    fromRemote: (x) => ({ id: x.id, name: x.name, amount: Number(x.amount), accountId: x.account_id, categoryId: x.category_id, cadence: x.cadence, dayOfMonth: x.day_of_month, startDate: x.start_date, active: !!x.active, mode: x.mode, lastPostedPeriod: x.last_posted_period ?? null, updatedAt: num(x.updated_at), deleted: !!x.deleted }),
  },
  settings: {
    remote: 'settings',
    dexie: () => db.settings,
    toRemote: (r, uid) => ({ user_id: uid, monthly_income: r.monthlyIncome, savings_target: r.savingsTarget, currency: r.currency, cycle_start_day: r.cycleStartDay, onboarded: !!r.onboarded, updated_at: r.updatedAt }),
    fromRemote: (x) => ({ id: 'singleton', monthlyIncome: num(x.monthly_income), savingsTarget: num(x.savings_target), currency: x.currency, cycleStartDay: num(x.cycle_start_day), onboarded: !!x.onboarded, updatedAt: num(x.updated_at) }),
  },
}

const TABLE_ORDER: SyncTable[] = ['settings', 'accounts', 'categories', 'recurring', 'transactions']

// --- Offline write queue (survives reloads / offline) ---
const QUEUE_KEY = 'duit_sync_queue'
const WATERMARK_KEY = 'duit_sync_watermark'

interface QueuedChange { table: SyncTable; row: any }

function loadQueue(): QueuedChange[] {
  try { return JSON.parse(localStorage.getItem(QUEUE_KEY) ?? '[]') } catch { return [] }
}
function saveQueue(q: QueuedChange[]) { localStorage.setItem(QUEUE_KEY, JSON.stringify(q)) }

// Called by repo on every local write.
export function queuePush(table: SyncTable, row: unknown) {
  if (!isOnlineMode) return
  const q = loadQueue()
  q.push({ table, row })
  saveQueue(q)
  scheduleFlush()
}

export function pendingCount(): number {
  return isOnlineMode ? loadQueue().length : 0
}

// --- Sync status (for the UI) ---
type Listener = () => void
const listeners = new Set<Listener>()
export const syncState = { authed: false, syncing: false, lastSyncAt: 0 as number, error: '' as string }
export function onSyncState(cb: Listener): () => void { listeners.add(cb); return () => listeners.delete(cb) }
function emit() { listeners.forEach((l) => l()) }

let userId: string | null = null
export function setUser(id: string | null) {
  userId = id
  syncState.authed = !!id
  emit()
}

// --- Flush queued writes to Supabase ---
let flushTimer: ReturnType<typeof setTimeout> | null = null
function scheduleFlush() {
  if (flushTimer) return
  flushTimer = setTimeout(() => { flushTimer = null; flushQueue() }, 800)
}

export async function flushQueue(): Promise<void> {
  if (!supabase || !userId) return
  let q = loadQueue()
  if (q.length === 0) return
  // Group by table and upsert.
  const remaining: QueuedChange[] = []
  for (const table of TABLE_ORDER) {
    const items = q.filter((c) => c.table === table)
    if (items.length === 0) continue
    const cfg = TABLES[table]
    const rows = items.map((c) => cfg.toRemote(c.row, userId!))
    const { error } = await supabase.from(cfg.remote).upsert(rows)
    if (error) {
      console.warn('sync push failed', table, error.message)
      remaining.push(...items) // keep for retry
    }
  }
  saveQueue(remaining)
}

// --- Pull remote changes into the local store ---
function getWatermark(): number { return Number(localStorage.getItem(WATERMARK_KEY) ?? '0') }
function setWatermark(v: number) { localStorage.setItem(WATERMARK_KEY, String(v)) }

export async function pull(): Promise<void> {
  if (!supabase || !userId) return
  const since = getWatermark()
  let maxSeen = since
  for (const table of TABLE_ORDER) {
    const cfg = TABLES[table]
    const { data, error } = await supabase
      .from(cfg.remote)
      .select('*')
      .gt('updated_at', since)
      .order('updated_at', { ascending: true })
    if (error) { console.warn('sync pull failed', table, error.message); continue }
    if (!data || data.length === 0) continue
    const dexieTable = cfg.dexie()
    for (const remoteRow of data) {
      const local = cfg.fromRemote(remoteRow)
      const existing = await dexieTable.get(local.id)
      if (!existing || num(existing.updatedAt) <= local.updatedAt) {
        await dexieTable.put(local)
      }
      if (local.updatedAt > maxSeen) maxSeen = local.updatedAt
    }
  }
  if (maxSeen > since) setWatermark(maxSeen)
}

// Push every local row up (first-device bootstrap). Idempotent upserts.
async function pushAllLocal(): Promise<void> {
  if (!supabase || !userId) return
  for (const table of TABLE_ORDER) {
    const cfg = TABLES[table]
    const rows: any[] = await cfg.dexie().toArray()
    if (rows.length === 0) continue
    const mapped = rows.map((r) => cfg.toRemote(r, userId!))
    const { error } = await supabase.from(cfg.remote).upsert(mapped)
    if (error) console.warn('bootstrap push failed', table, error.message)
  }
}

// --- Bootstrap on login: decide seed vs adopt-remote, then sync ---
let bootstrapped = false
export async function bootstrap(): Promise<void> {
  if (!supabase || !userId || bootstrapped) return
  bootstrapped = true
  syncState.syncing = true
  emit()
  try {
    await pull() // fetch anything already in the cloud first
    const remoteHasData = (await db.accounts.count()) > 0
    if (!remoteHasData) {
      await ensureSeeded()     // fresh account: create defaults locally…
      await pushAllLocal()     // …and populate the cloud from this device
    } else {
      await flushQueue()       // adopt remote, then push any local edits
    }
    syncState.lastSyncAt = Date.now()
    syncState.error = ''
  } catch (e) {
    syncState.error = e instanceof Error ? e.message : 'Sync failed'
  } finally {
    syncState.syncing = false
    emit()
  }
}

// A full round-trip used by the periodic timer and manual refresh.
export async function syncNow(): Promise<void> {
  if (!supabase || !userId) return
  syncState.syncing = true
  emit()
  try {
    await flushQueue()
    await pull()
    syncState.lastSyncAt = Date.now()
    syncState.error = ''
  } catch (e) {
    syncState.error = e instanceof Error ? e.message : 'Sync failed'
  } finally {
    syncState.syncing = false
    emit()
  }
}

let interval: ReturnType<typeof setInterval> | null = null
export function startAutoSync() {
  if (interval || !isOnlineMode) return
  interval = setInterval(() => { if (userId) syncNow() }, 20000)
  window.addEventListener('online', () => syncNow())
  document.addEventListener('visibilitychange', () => { if (!document.hidden) syncNow() })
}
