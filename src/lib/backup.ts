import { db } from '../db'

// Full local export/import. This is the user's safety net and the manual way to
// move data between devices before (or instead of) online sync.

interface BackupFile {
  app: 'duit-finance'
  version: 1
  exportedAt: string
  data: {
    accounts: unknown[]
    categories: unknown[]
    transactions: unknown[]
    recurring: unknown[]
    settings: unknown[]
  }
}

export async function exportBackup(): Promise<void> {
  const [accounts, categories, transactions, recurring, settings] = await Promise.all([
    db.accounts.toArray(),
    db.categories.toArray(),
    db.transactions.toArray(),
    db.recurring.toArray(),
    db.settings.toArray(),
  ])
  const payload: BackupFile = {
    app: 'duit-finance',
    version: 1,
    exportedAt: new Date().toISOString(),
    data: { accounts, categories, transactions, recurring, settings },
  }
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `duit-backup-${new Date().toISOString().slice(0, 10)}.json`
  a.click()
  URL.revokeObjectURL(url)
}

export async function importBackup(file: File): Promise<{ transactions: number }> {
  const text = await file.text()
  const parsed = JSON.parse(text) as BackupFile
  if (parsed.app !== 'duit-finance') {
    throw new Error('Not a Duit backup file.')
  }
  const { accounts, categories, transactions, recurring, settings } = parsed.data
  await db.transaction('rw', db.accounts, db.categories, db.transactions, db.recurring, db.settings, async () => {
    await db.accounts.clear()
    await db.categories.clear()
    await db.transactions.clear()
    await db.recurring.clear()
    await db.settings.clear()
    await db.accounts.bulkAdd(accounts as never)
    await db.categories.bulkAdd(categories as never)
    await db.transactions.bulkAdd(transactions as never)
    await db.recurring.bulkAdd(recurring as never)
    await db.settings.bulkAdd(settings as never)
  })
  return { transactions: (transactions as unknown[]).length }
}
