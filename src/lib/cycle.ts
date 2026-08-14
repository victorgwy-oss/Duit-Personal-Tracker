import { fromISO, toISO } from './format'

// A "cycle" is the user's budgeting period. cycleStartDay === 1 means a plain
// calendar month; any other day aligns the cycle to (say) their credit-card
// statement date, so "spent this cycle" matches the bill they will actually pay.

export interface Cycle {
  start: Date
  end: Date // inclusive last day
  key: string // yyyy-mm of the start date
  label: string
}

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]

export function getCycle(cycleStartDay: number, ref: Date = new Date()): Cycle {
  const day = clampDay(cycleStartDay)

  if (day === 1) {
    const start = new Date(ref.getFullYear(), ref.getMonth(), 1)
    const end = new Date(ref.getFullYear(), ref.getMonth() + 1, 0)
    return cycleFrom(start, end)
  }

  // Statement-aligned: cycle starts on `day`. If today is before `day`, the
  // active cycle began in the previous month.
  let startMonth = ref.getMonth()
  let startYear = ref.getFullYear()
  if (ref.getDate() < day) {
    startMonth -= 1
    if (startMonth < 0) {
      startMonth = 11
      startYear -= 1
    }
  }
  const start = new Date(startYear, startMonth, day)
  const end = new Date(startYear, startMonth + 1, day - 1)
  return cycleFrom(start, end)
}

export function shiftCycle(cycle: Cycle, cycleStartDay: number, months: number): Cycle {
  const ref = new Date(cycle.start.getFullYear(), cycle.start.getMonth() + months, cycle.start.getDate())
  return getCycle(cycleStartDay, ref)
}

function cycleFrom(start: Date, end: Date): Cycle {
  const key = `${start.getFullYear()}-${String(start.getMonth() + 1).padStart(2, '0')}`
  const label = `${MONTHS[start.getMonth()]} ${start.getFullYear()}`
  return { start, end, key, label }
}

export function isInCycle(iso: string, cycle: Cycle): boolean {
  const d = fromISO(iso)
  return d >= stripTime(cycle.start) && d <= stripTime(cycle.end)
}

export function cycleStartISO(cycle: Cycle): string {
  return toISO(cycle.start)
}
export function cycleEndISO(cycle: Cycle): string {
  return toISO(cycle.end)
}

// How far through the cycle we are, for projecting the rest of the month.
export function cycleProgress(cycle: Cycle, ref: Date = new Date()): {
  daysElapsed: number
  daysTotal: number
  daysLeft: number
  fraction: number
} {
  const start = stripTime(cycle.start).getTime()
  const end = stripTime(cycle.end).getTime()
  const today = stripTime(ref).getTime()
  const dayMs = 86400000
  const daysTotal = Math.round((end - start) / dayMs) + 1
  const clamped = Math.min(Math.max(today, start), end)
  const daysElapsed = Math.round((clamped - start) / dayMs) + 1
  const daysLeft = Math.max(daysTotal - daysElapsed, 0)
  return { daysElapsed, daysTotal, daysLeft, fraction: daysElapsed / daysTotal }
}

function clampDay(d: number): number {
  if (!Number.isFinite(d)) return 1
  return Math.min(Math.max(Math.round(d), 1), 28)
}

function stripTime(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate())
}
