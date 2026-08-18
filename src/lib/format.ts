// Currency + date formatting helpers.

export function formatMoney(amount: number, currency = 'RM'): string {
  const sign = amount < 0 ? '-' : ''
  const abs = Math.abs(amount)
  return `${sign}${currency}${abs.toLocaleString('en-MY', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`
}

// Compact form for big glance numbers: RM1,234.50 stays, but keeps it tidy.
export function formatMoneyShort(amount: number, currency = 'RM'): string {
  const abs = Math.abs(amount)
  const sign = amount < 0 ? '-' : ''
  if (abs >= 1000) {
    return `${sign}${currency}${abs.toLocaleString('en-MY', {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    })}`
  }
  return formatMoney(amount, currency)
}

export function todayISO(): string {
  return toISO(new Date())
}

export function toISO(d: Date): string {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export function fromISO(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(y, m - 1, d)
}

const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
const MONTH_LABELS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
]

export function formatDayLabel(iso: string): string {
  const d = fromISO(iso)
  const today = todayISO()
  if (iso === today) return 'Today'
  const yst = new Date()
  yst.setDate(yst.getDate() - 1)
  if (iso === toISO(yst)) return 'Yesterday'
  return `${DAY_LABELS[d.getDay()]}, ${d.getDate()} ${MONTH_LABELS[d.getMonth()]}`
}

export function formatShortDate(iso: string): string {
  const d = fromISO(iso)
  return `${d.getDate()} ${MONTH_LABELS[d.getMonth()]}`
}

// Clock time an entry was recorded, from its createdAt ms timestamp, e.g.
// "2:45 PM". Returns '' for missing/zero timestamps.
export function formatTime(ms: number): string {
  if (!ms) return ''
  return new Date(ms).toLocaleTimeString('en-MY', {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  })
}
