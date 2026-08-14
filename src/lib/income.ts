import type { IncomeSource, IncomeOverride } from './types'

// Resolving income for a given month: for each active source, use its per-month
// override if one exists, otherwise fall back to the source's default amount.

export interface ResolvedIncomeLine {
  source: IncomeSource
  amount: number
  overridden: boolean // true when this month has a specific figure set
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
): ResolvedIncome {
  const overrideMap = new Map<string, IncomeOverride>()
  for (const o of overrides) {
    if (o.deleted) continue
    if (o.monthKey === monthKey) overrideMap.set(o.sourceId, o)
  }

  const lines: ResolvedIncomeLine[] = []
  for (const source of sources) {
    if (source.deleted || !source.active) continue
    const o = overrideMap.get(source.id)
    lines.push({
      source,
      amount: o ? o.amount : source.defaultAmount,
      overridden: !!o,
    })
  }

  const total = lines.reduce((sum, l) => sum + l.amount, 0)
  return { total, lines }
}
