// Pure decision logic for sync — no database or network, so it can be tested
// in isolation. sync.ts does the I/O around these.

export interface QueuedChange {
  table: string
  row: any
  qid?: string // unique per queued write, so a flush removes exactly what it sent
}

// After an upload, keep everything except the writes that were actually sent.
// Must be applied to the queue as it is NOW (re-read after the upload), not to
// the snapshot taken before it: writes made during the upload have to survive.
export function dropSent(queue: QueuedChange[], sent: Set<string>): QueuedChange[] {
  return queue.filter((c) => !c.qid || !sent.has(c.qid))
}

// One upsert can't touch the same row twice (Postgres rejects the whole batch),
// so collapse a table's queued writes to the latest version of each row.
export function latestPerRow(items: QueuedChange[]): QueuedChange[] {
  const byRow = new Map<string, QueuedChange>()
  for (const c of items) byRow.set(String(c.row?.id ?? 'singleton'), c)
  return [...byRow.values()]
}

// Recurring charges that exist only on this device yet duplicate another live
// copy of the same occurrence (same rule, same date) — e.g. ones a stale app
// build posted but never uploaded. Uploading them would re-create duplicates,
// so reconcile marks them deleted instead. Only ever returns local-only rows;
// rows the cloud already has are left to the cloud.
export interface RecurringRow {
  id: string
  recurringId?: string
  date: string
  deleted?: boolean
  createdAt: number
}

export function localOnlyRecurringDupes(rows: RecurringRow[], remoteIds: Set<string>): string[] {
  const groups = new Map<string, RecurringRow[]>()
  for (const r of rows) {
    if (!r.recurringId || r.deleted) continue
    const key = `${r.recurringId}|${r.date}`
    groups.set(key, [...(groups.get(key) ?? []), r])
  }
  const dupes: string[] = []
  for (const group of groups.values()) {
    if (group.length < 2) continue
    // Keep one: the cloud's copy if it has one, else the earliest recorded.
    const keep = group.find((r) => remoteIds.has(r.id)) ?? [...group].sort((a, b) => a.createdAt - b.createdAt)[0]
    for (const r of group) if (r !== keep && !remoteIds.has(r.id)) dupes.push(r.id)
  }
  return dupes
}

export interface Stamp {
  id: string
  updatedAt: number
  name?: string
}

// Decide what this device and the cloud should exchange so both hold the newest
// version of every row (last write wins), regardless of sync cursors:
// - push: local rows the cloud lacks, or holds an older version of;
// - fetch: cloud rows this device lacks, or holds an older version of.
// For named lists (wallets, categories) a local row the cloud lacks is NOT
// pushed if the cloud already has that name under another id — that would
// create a duplicate.
export function planReconcile(
  local: Stamp[],
  remote: Stamp[],
  guardNames: boolean,
): { push: string[]; fetch: string[] } {
  const norm = (s?: string) => (s ?? '').trim().toLowerCase()
  const remoteById = new Map(remote.map((r) => [r.id, r]))
  const localById = new Map(local.map((l) => [l.id, l]))
  const remoteNames = new Set(remote.map((r) => norm(r.name)))

  const push: string[] = []
  for (const l of local) {
    const r = remoteById.get(l.id)
    if (r) {
      if (l.updatedAt > r.updatedAt) push.push(l.id)
    } else if (!(guardNames && remoteNames.has(norm(l.name)))) {
      push.push(l.id)
    }
  }

  const fetch: string[] = []
  for (const r of remote) {
    const l = localById.get(r.id)
    if (!l || l.updatedAt < r.updatedAt) fetch.push(r.id)
  }
  return { push, fetch }
}
