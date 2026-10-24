import { useMemo } from 'react'
import {
  useAllTransactions,
  useAssets,
  useIncomeOverrides,
  useIncomePayments,
  useIncomeSources,
  useRecurring,
  useSettings,
  useWellbeing,
} from './useData'
import { getCycle } from '../lib/cycle'
import { monthlyCommitment } from '../lib/recurring'
import {
  averageMonthlySpend,
  coverage,
  keptForCycle,
  previousCycles,
  summarizeWorth,
  type CycleKept,
  type WorthSummary,
} from '../lib/wins'
import type { Wellbeing } from '../lib/types'

export interface WinsPicture {
  worth: WorthSummary
  wellbeing: Wellbeing
  avgSpend: number // average monthly spending over the last 3 completed months with records
  fixedMonthly: number // recurring bills per month
  coverUsual: { months: number; days: number } | null // savings ÷ usual spending
  coverBills: { months: number; days: number } | null // savings ÷ fixed bills only
  recent: CycleKept[] // last two completed months, most recent first
}

// One place that computes the reassuring numbers, so Home and the "Feeling
// broke?" screen always agree with each other.
export function useWins(): WinsPicture | null {
  const settings = useSettings()
  const assets = useAssets()
  const wellbeing = useWellbeing()
  const txns = useAllTransactions()
  const sources = useIncomeSources()
  const overrides = useIncomeOverrides()
  const payments = useIncomePayments()
  const recurring = useRecurring()

  return useMemo(() => {
    if (!settings || !assets || !wellbeing || !txns || !sources || !overrides || !payments || !recurring) return null
    const current = getCycle(settings.cycleStartDay)
    const past = previousCycles(current, settings.cycleStartDay, 3).map((c) =>
      keptForCycle(c, txns, sources, overrides, payments),
    )
    const worth = summarizeWorth(assets)
    const avgSpend = averageMonthlySpend(past)
    const fixedMonthly = monthlyCommitment(recurring)
    return {
      worth,
      wellbeing,
      avgSpend,
      fixedMonthly,
      coverUsual: coverage(worth.safetyNet, avgSpend),
      coverBills: coverage(worth.safetyNet, fixedMonthly),
      recent: past.slice(0, 2),
    }
  }, [settings, assets, wellbeing, txns, sources, overrides, payments, recurring])
}


// Re-exported so screens can import it alongside useWins.
export { describeCover } from '../lib/wins'
