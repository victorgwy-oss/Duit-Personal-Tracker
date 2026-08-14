import { db } from '../db'
import { addTransaction } from './repo'
import { toISO } from './format'

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
