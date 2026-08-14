import { db } from '../db'
import { addTransaction, upsertCategory, upsertAccount } from './repo'
import { toISO } from './format'
import type { CategoryGroup } from './types'

// Parse a pasted / uploaded statement (CSV, TSV, or copied text) and turn rows
// into candidate transactions, flagging likely duplicates so recurring/manual
// entries you already logged don't get counted twice.

export interface ParsedRow {
  raw: string[]
  date: string | null
  amount: number | null
  description: string
}

export interface ColumnMap {
  date: number
  amount: number
  description: number
}

export interface ImportCandidate {
  date: string
  amount: number
  description: string
  duplicate: boolean // matches an existing transaction closely
  include: boolean
}

// --- Delimited parsing ---
export function detectDelimiter(text: string): string {
  const sample = text.split(/\r?\n/).slice(0, 5).join('\n')
  const counts: Record<string, number> = {
    ',': (sample.match(/,/g) || []).length,
    '\t': (sample.match(/\t/g) || []).length,
    ';': (sample.match(/;/g) || []).length,
  }
  return Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0] || ','
}

export function parseDelimited(text: string, delimiter: string): string[][] {
  const rows: string[][] = []
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue
    rows.push(parseLine(line, delimiter))
  }
  return rows
}

function parseLine(line: string, delimiter: string): string[] {
  const out: string[] = []
  let cur = ''
  let inQuotes = false
  for (let i = 0; i < line.length; i++) {
    const ch = line[i]
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') {
        cur += '"'
        i++
      } else inQuotes = !inQuotes
    } else if (ch === delimiter && !inQuotes) {
      out.push(cur.trim())
      cur = ''
    } else cur += ch
  }
  out.push(cur.trim())
  return out
}

// --- Heuristic column detection ---
export function guessColumns(rows: string[][]): ColumnMap {
  const scan = rows.slice(0, Math.min(rows.length, 12))
  let date = -1
  let amount = -1
  let description = -1
  const width = Math.max(...scan.map((r) => r.length))
  for (let c = 0; c < width; c++) {
    const vals = scan.map((r) => r[c] ?? '').filter(Boolean)
    if (vals.length === 0) continue
    const dateHits = vals.filter((v) => parseDate(v) !== null).length
    const numHits = vals.filter((v) => parseAmount(v) !== null).length
    if (date === -1 && dateHits >= vals.length * 0.6) date = c
    else if (amount === -1 && numHits >= vals.length * 0.6) amount = c
  }
  // Description = the widest text column that isn't date/amount.
  let bestLen = -1
  for (let c = 0; c < width; c++) {
    if (c === date || c === amount) continue
    const avg = scan.reduce((s, r) => s + (r[c]?.length ?? 0), 0) / scan.length
    if (avg > bestLen) {
      bestLen = avg
      description = c
    }
  }
  return { date: Math.max(date, 0), amount: Math.max(amount, 1), description: Math.max(description, 0) }
}

// --- Value parsers ---
export function parseAmount(v: string): number | null {
  if (!v) return null
  // Parenthesised or trailing/leading minus means a negative figure.
  const negative = /^\(.*\)$/.test(v.trim()) || /-/.test(v)
  // Strip currency symbols/codes, thousands separators, and any other noise.
  const s = v.replace(/RM|MYR|\$/gi, '').replace(/[(),]/g, '').replace(/[^0-9.]/g, '')
  if (s === '' || s === '.') return null
  const n = parseFloat(s)
  if (Number.isNaN(n)) return null
  return negative ? -n : n
}

export function parseDate(v: string): string | null {
  if (!v) return null
  const s = v.trim()
  // ISO yyyy-mm-dd
  let m = s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/)
  if (m) return iso(+m[1], +m[2], +m[3])
  // dd/mm/yyyy or dd-mm-yyyy (Malaysian default)
  m = s.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{2,4})/)
  if (m) {
    let year = +m[3]
    if (year < 100) year += 2000
    return iso(year, +m[2], +m[1])
  }
  // dd Mon yyyy
  m = s.match(/^(\d{1,2})\s+([A-Za-z]{3,})\s+(\d{2,4})/)
  if (m) {
    const mon = monthIndex(m[2])
    if (mon >= 0) {
      let year = +m[3]
      if (year < 100) year += 2000
      return iso(year, mon + 1, +m[1])
    }
  }
  // Mon dd, yyyy  (e.g. "Aug 01, 2026 9:36 AM")
  m = s.match(/^([A-Za-z]{3,})\s+(\d{1,2}),?\s+(\d{2,4})/)
  if (m) {
    const mon = monthIndex(m[1])
    if (mon >= 0) {
      let year = +m[3]
      if (year < 100) year += 2000
      return iso(year, mon + 1, +m[2])
    }
  }
  return null
}

function iso(y: number, mo: number, d: number): string | null {
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null
  return toISO(new Date(y, mo - 1, d))
}

function monthIndex(name: string): number {
  const M = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']
  return M.indexOf(name.slice(0, 3).toLowerCase())
}

// --- Build candidates + dedupe ---
export async function buildCandidates(rows: string[][], map: ColumnMap): Promise<ImportCandidate[]> {
  // Skip a header row if its cells don't parse as data.
  const dataRows = rows.filter((r) => parseDate(r[map.date] ?? '') !== null && parseAmount(r[map.amount] ?? '') !== null)

  const existing = await db.transactions.filter((t) => !t.deleted).toArray()
  const existingKeys = new Set(existing.map((t) => `${t.date}|${Math.abs(t.amount).toFixed(2)}`))

  return dataRows.map((r) => {
    const date = parseDate(r[map.date] ?? '')!
    const rawAmount = parseAmount(r[map.amount] ?? '')!
    const amount = Math.abs(rawAmount) // treat statement debits as expenses
    const description = (r[map.description] ?? '').trim()
    const duplicate = existingKeys.has(`${date}|${amount.toFixed(2)}`)
    return { date, amount, description, duplicate, include: !duplicate }
  })
}

export async function commitImport(
  candidates: ImportCandidate[],
  accountId: string,
  categoryId: string,
): Promise<number> {
  let n = 0
  for (const c of candidates) {
    if (!c.include) continue
    await addTransaction({
      date: c.date,
      amount: c.amount,
      accountId,
      categoryId,
      note: c.description,
      source: 'import',
      reconciled: true,
    })
    n++
  }
  return n
}

// ===========================================================================
// Tracker migration — richer import for exports from other budgeting apps that
// carry TYPE (income/expense), CATEGORY and ACCOUNT columns. Categories and
// wallets are mapped to existing ones (or auto-created), and income rows are
// skipped by default since the app models income as a monthly figure.
// ===========================================================================

export interface FullColumnMap {
  date: number
  amount: number
  type: number | null
  category: number | null
  account: number | null
  note: number
}

const nz = (n: number): number | null => (n >= 0 ? n : null)

// Detect columns from a header row by name. Returns null if it doesn't look
// like a labelled export (no recognisable date/amount headers).
export function detectHeaderColumns(header: string[]): FullColumnMap | null {
  const idx = (re: RegExp) => header.findIndex((h) => re.test((h ?? '').trim().toLowerCase()))
  const date = idx(/\b(time|date)\b/)
  const amount = idx(/\b(amount|amt|value)\b/)
  if (date < 0 || amount < 0) return null
  const note = idx(/\b(note|notes|desc|description|memo|remark|detail)\b/)
  return {
    date,
    amount,
    type: nz(idx(/\b(type|in\s*\/\s*out|direction|flow)\b/)),
    category: nz(idx(/\b(category|categories|cat)\b/)),
    account: nz(idx(/\b(account|wallet|source)\b/)),
    note: note >= 0 ? note : amount,
  }
}

// A cell like "(+) Income" / "Credit" => money in.
export function isIncomeType(v: string): boolean {
  return /(\(\+\)|\bincome\b|\bcredit\b|\bdeposit\b|\bin\b)/i.test(v ?? '')
}

export interface TrackerCandidate {
  date: string
  amount: number
  isIncome: boolean
  categoryName: string
  accountName: string
  note: string
  duplicate: boolean
  include: boolean
}

export async function buildTrackerCandidates(
  rows: string[][],
  map: FullColumnMap,
  hasHeader: boolean,
): Promise<TrackerCandidate[]> {
  const body = hasHeader ? rows.slice(1) : rows
  const existing = await db.transactions.filter((t) => !t.deleted).toArray()
  const existingKeys = new Set(existing.map((t) => key(t.date, Math.abs(t.amount), t.note)))

  const out: TrackerCandidate[] = []
  const seen = new Set<string>()
  for (const r of body) {
    const date = parseDate(r[map.date] ?? '')
    const amt = parseAmount(r[map.amount] ?? '')
    if (date === null || amt === null) continue
    const amount = Math.abs(amt)
    const isIncome = map.type != null ? isIncomeType(r[map.type] ?? '') : amt < 0
    const categoryName = (map.category != null ? r[map.category] : '')?.trim() ?? ''
    const accountName = (map.account != null ? r[map.account] : '')?.trim() ?? ''
    const note = (r[map.note] ?? '').trim()
    const k = key(date, amount, note)
    const duplicate = existingKeys.has(k) || seen.has(k)
    seen.add(k)
    out.push({ date, amount, isIncome, categoryName, accountName, note, duplicate, include: !duplicate })
  }
  return out
}

function key(date: string, amount: number, note: string): string {
  return `${date}|${amount.toFixed(2)}|${note.toLowerCase()}`
}

export function distinctValues(cands: TrackerCandidate[], field: 'categoryName' | 'accountName'): string[] {
  const set = new Set<string>()
  for (const c of cands) {
    const v = c[field]
    if (v) set.add(v)
  }
  return [...set].sort()
}

// Best existing match for a CSV name: exact (case-insensitive), else substring
// either direction (so "Food" → "Food & Dining", "Bills" → "Bills & Utilities").
export function suggestMatch(name: string, options: { id: string; name: string }[]): string | null {
  const n = name.trim().toLowerCase()
  const exact = options.find((o) => o.name.toLowerCase() === n)
  if (exact) return exact.id
  const partial = options.find((o) => o.name.toLowerCase().includes(n) || n.includes(o.name.toLowerCase()))
  return partial ? partial.id : null
}

function guessGroup(name: string): CategoryGroup {
  const n = name.toLowerCase()
  if (/insurance|rent|loan|subscription|bill|utilit|mortgage|internet|phone|tax/.test(n)) return 'fixed'
  return 'discretionary'
}
function guessIcon(name: string): string {
  const n = name.toLowerCase()
  if (/food|dining|eat|restaurant|cafe|coffee/.test(n)) return '🍜'
  if (/shop/.test(n)) return '🛍️'
  if (/entertain|movie|game|fun|leisure/.test(n)) return '🎬'
  if (/electronic|gadget|tech|device/.test(n)) return '📱'
  if (/transport|grab|petrol|fuel|car|toll|parking/.test(n)) return '🚗'
  if (/bill|utilit/.test(n)) return '💡'
  if (/travel|flight|hotel|holiday/.test(n)) return '✈️'
  if (/health|medic|pharma|doctor|clinic/.test(n)) return '💊'
  if (/grocer|market/.test(n)) return '🛒'
  return '🏷️'
}

const NEW = '__new__'
export { NEW as CREATE_NEW }

export interface TrackerCommitOptions {
  candidates: TrackerCandidate[]
  categoryChoice: Record<string, string> // csv category name -> categoryId | CREATE_NEW
  accountChoice: Record<string, string> // csv account name -> accountId | CREATE_NEW
  fallbackCategoryId: string // for rows with a blank category
  fallbackAccountId: string
  skipIncome: boolean
}

const NEW_COLORS = ['#f59e0b', '#84cc16', '#06b6d4', '#a855f7', '#ec4899', '#14b8a6', '#6366f1', '#8b5cf6']

export async function commitTracker(opts: TrackerCommitOptions): Promise<{ imported: number; skippedIncome: number; skippedDup: number }> {
  const { candidates, categoryChoice, accountChoice, fallbackCategoryId, fallbackAccountId, skipIncome } = opts

  // Only the rows that will actually be written matter for what we create.
  const willImport = (c: TrackerCandidate) => c.include && !(c.isIncome && skipIncome)
  const neededCats = new Set(candidates.filter(willImport).map((c) => c.categoryName).filter(Boolean))
  const neededAccs = new Set(candidates.filter(willImport).map((c) => c.accountName).filter(Boolean))

  // Resolve every needed CSV name to a concrete id, creating new rows where chosen.
  const catIds = new Map<string, string>()
  let colorI = 0
  for (const [name, choice] of Object.entries(categoryChoice)) {
    if (!neededCats.has(name)) continue
    if (choice === NEW) {
      const created = await upsertCategory({
        name,
        group: guessGroup(name),
        icon: guessIcon(name),
        color: NEW_COLORS[colorI++ % NEW_COLORS.length],
        monthlyBudget: 0,
      })
      catIds.set(name, created.id)
    } else {
      catIds.set(name, choice)
    }
  }
  const accIds = new Map<string, string>()
  for (const [name, choice] of Object.entries(accountChoice)) {
    if (!neededAccs.has(name)) continue
    if (choice === NEW) {
      const created = await upsertAccount({ name, type: 'ewallet', color: NEW_COLORS[colorI++ % NEW_COLORS.length] })
      accIds.set(name, created.id)
    } else {
      accIds.set(name, choice)
    }
  }

  let imported = 0
  let skippedIncome = 0
  let skippedDup = 0
  for (const c of candidates) {
    if (!c.include) { skippedDup++; continue }
    if (c.isIncome && skipIncome) { skippedIncome++; continue }
    const categoryId = catIds.get(c.categoryName) ?? fallbackCategoryId
    const accountId = accIds.get(c.accountName) ?? fallbackAccountId
    await addTransaction({
      date: c.date,
      amount: c.amount,
      accountId,
      categoryId,
      note: c.note,
      source: 'import',
      reconciled: true,
    })
    imported++
  }
  return { imported, skippedIncome, skippedDup }
}
