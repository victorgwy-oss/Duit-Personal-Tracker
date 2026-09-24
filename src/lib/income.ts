import type { IncomeSource, IncomeOverride, IncomePayment } from './types'

// Resolving income for a given month (cycle):
// - Fixed streams (salary, rent): the month's override if set, else the default.
// - Payment-tracked streams (business): any amount set manually for the month
//   (kept as an opening figure) plus every payment received within the cycle.
//   The default is NOT used, so a forecast is never mixed with actual payments.

export interface ResolvedIncomeLine {
  source: IncomeSource
  amount: number
  overridden: boolean // true when this month has a manually set figure
  tracked: boolean // built from payments
  base: number // manual figure counted before payments (0 if none)
  payments: IncomePayment[] // this cycle's payments, oldest first
}

export interface ResolvedIncome {
  total: number
  lines: ResolvedIncomeLine[]
}

export function overrideId(sourceId: string, monthKey: string): string {
  return `${sourceId}:${monthKey}`
}

export function resolveIncome(
  sources: IncomeSource[],
  overrides: IncomeOverride[],
  monthKey: string,
  payments: IncomePayment[] = [],
  // Inclusive ISO bounds of the cycle, so payments bucket by the user's cycle
  // (which may be statement-aligned rather than a calendar month).
  range?: { start: string; end: string },
): ResolvedIncome {
  const overrideMap = new Map<string, IncomeOverride>()
  for (const o of overrides) {
    if (o.deleted) continue
    if (o.monthKey === monthKey) overrideMap.set(o.sourceId, o)
  }

  const inCycle = (date: string) =>
    range ? date >= range.start && date <= range.end : date.slice(0, 7) === monthKey
  const paymentsBySource = new Map<string, IncomePayment[]>()
  for (const p of payments) {
    if (p.deleted || !inCycle(p.date)) continue
    const list = paymentsBySource.get(p.sourceId) ?? []
    list.push(p)
    paymentsBySource.set(p.sourceId, list)
  }

  const lines: ResolvedIncomeLine[] = []
  for (const source of sources) {
    if (source.deleted || !source.active) continue
    const o = overrideMap.get(source.id)
    const sourcePayments = (paymentsBySource.get(source.id) ?? []).sort((a, b) =>
      a.date === b.date ? a.createdAt - b.createdAt : a.date.localeCompare(b.date),
    )
    const tracked = !!source.trackPayments || sourcePayments.length > 0

    if (tracked) {
      const base = o ? o.amount : 0
      const paid = sourcePayments.reduce((sum, p) => sum + p.amount, 0)
      lines.push({ source, amount: base + paid, overridden: !!o, tracked, base, payments: sourcePayments })
    } else {
      lines.push({
        source,
        amount: o ? o.amount : source.defaultAmount,
        overridden: !!o,
        tracked,
        base: 0,
        payments: [],
      })
    }
  }

  const total = lines.reduce((sum, l) => sum + l.amount, 0)
  return { total, lines }
}
