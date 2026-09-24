import { useMemo, useState } from 'react'
import Sheet from './Sheet'
import AmountField from './AmountField'
import { useIncomeOverrides, useIncomePayments, useIncomeSources, useSettings } from '../hooks/useData'
import {
  addIncomePayment,
  deleteIncomePayment,
  deleteIncomeSource,
  setIncomeOverride,
  setTrackPayments,
  updateIncomePayment,
  upsertIncomeSource,
} from '../lib/repo'
import { resolveIncome, type ResolvedIncomeLine } from '../lib/income'
import { getCycle, shiftCycle, cycleStartISO, cycleEndISO } from '../lib/cycle'
import { formatMoney, formatShortDate, todayISO } from '../lib/format'
import { ChevronLeft, ChevronRight } from './icons'
import type { IncomePayment, IncomeSource } from '../lib/types'

const COLORS = ['#22c55e', '#0ea5e9', '#a855f7', '#f59e0b', '#ec4899', '#14b8a6', '#6366f1', '#f472b6']

// Editor for the user's income streams. Fixed streams (salary, rent) hold a
// monthly figure you can override per month. Payment-tracked streams (business)
// are built from payments you log as clients pay — the month total sums them.
export default function IncomeSheet({
  open,
  onClose,
  initialOffset = 0,
}: {
  open: boolean
  onClose: () => void
  initialOffset?: number
}) {
  const settings = useSettings()
  const sources = useIncomeSources()
  const overrides = useIncomeOverrides()
  const payments = useIncomePayments()
  const [offset, setOffset] = useState(initialOffset)
  const [editing, setEditing] = useState<IncomeSource | 'new' | null>(null)
  const [paymentEdit, setPaymentEdit] = useState<{ source: IncomeSource; payment: IncomePayment | null } | null>(
    null,
  )

  const cycle = useMemo(() => {
    if (!settings) return null
    const base = getCycle(settings.cycleStartDay)
    return offset === 0 ? base : shiftCycle(base, settings.cycleStartDay, offset)
  }, [settings, offset])

  const currency = settings?.currency ?? 'RM'
  const monthKey = cycle?.key ?? ''
  const rangeStart = cycle ? cycleStartISO(cycle) : ''
  const rangeEnd = cycle ? cycleEndISO(cycle) : ''
  const resolved = useMemo(
    () =>
      resolveIncome(sources ?? [], overrides ?? [], monthKey, payments ?? [], {
        start: rangeStart,
        end: rangeEnd,
      }),
    [sources, overrides, payments, monthKey, rangeStart, rangeEnd],
  )

  // New payments default to today when viewing the current cycle, otherwise to
  // the viewed cycle's first day so they land in the month on screen.
  const today = todayISO()
  const defaultPaymentDate = today >= rangeStart && today <= rangeEnd ? today : rangeStart || today
  const monthName = cycle?.label.split(' ')[0] ?? ''

  return (
    <Sheet open={open} onClose={onClose} title="Income" full>
      {/* Month switcher */}
      <div className="flex items-center justify-between mb-4">
        <button onClick={() => setOffset(offset - 1)} className="p-2 text-ink-400 hover:text-ink-100">
          <ChevronLeft width={20} height={20} />
        </button>
        <div className="text-sm font-medium text-ink-200">{cycle?.label ?? '—'}</div>
        <button onClick={() => setOffset(offset + 1)} className="p-2 text-ink-400 hover:text-ink-100">
          <ChevronRight width={20} height={20} />
        </button>
      </div>

      <div className="rounded-2xl bg-gradient-to-br from-ink-800 to-ink-900 border border-ink-800 p-4 mb-4">
        <div className="text-xs text-ink-400">Total income · {cycle?.label}</div>
        <div className="text-3xl font-bold text-ink-100 tabular-nums mt-0.5">
          {formatMoney(resolved.total, currency)}
        </div>
      </div>

      <div className="space-y-2 mb-4">
        {resolved.lines.map((line) =>
          line.tracked ? (
            <TrackedLine
              key={line.source.id}
              line={line}
              currency={currency}
              monthKey={monthKey}
              monthName={monthName}
              onEditSource={() => setEditing(line.source)}
              onAddPayment={() => setPaymentEdit({ source: line.source, payment: null })}
              onEditPayment={(p) => setPaymentEdit({ source: line.source, payment: p })}
            />
          ) : (
            <FixedLine
              key={line.source.id}
              line={line}
              currency={currency}
              monthKey={monthKey}
              monthName={monthName}
              cycleLabel={cycle?.label ?? ''}
              onEditSource={() => setEditing(line.source)}
            />
          ),
        )}
      </div>

      <button
        onClick={() => setEditing('new')}
        className="w-full py-3 rounded-xl border border-dashed border-ink-600 text-ink-300 text-sm"
      >
        + Add income stream
      </button>

      <p className="text-xs text-ink-500 mt-3">
        Payment-logged streams: tap <span className="text-ink-300">+ Add payment</span> whenever a client pays — the
        month adds itself up. Fixed streams: change an amount to set it just for {cycle?.label}.
      </p>

      {editing && (
        <SourceEditor source={editing === 'new' ? null : editing} currency={currency} onClose={() => setEditing(null)} />
      )}

      {paymentEdit && (
        <PaymentEditor
          source={paymentEdit.source}
          payment={paymentEdit.payment}
          defaultDate={defaultPaymentDate}
          currency={currency}
          onClose={() => setPaymentEdit(null)}
        />
      )}
    </Sheet>
  )
}

function TrackedLine({
  line,
  currency,
  monthKey,
  monthName,
  onEditSource,
  onAddPayment,
  onEditPayment,
}: {
  line: ResolvedIncomeLine
  currency: string
  monthKey: string
  monthName: string
  onEditSource: () => void
  onAddPayment: () => void
  onEditPayment: (p: IncomePayment) => void
}) {
  const { source, amount, base, payments } = line
  return (
    <div className="rounded-xl bg-ink-800 border border-ink-700 px-3 py-2.5">
      <div className="flex items-center gap-2">
        <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: source.color }} />
        <button onClick={onEditSource} className="text-sm text-ink-100 flex-1 text-left">
          {source.name}
        </button>
        <span className="text-sm font-semibold text-ink-100 tabular-nums">{formatMoney(amount, currency)}</span>
      </div>
      <div className="text-xs text-ink-500 mt-0.5 mb-1.5 ml-[18px]">
        {payments.length > 0
          ? `${payments.length} payment${payments.length > 1 ? 's' : ''} in ${monthName}`
          : `No payments logged in ${monthName} yet`}
      </div>

      {(base > 0 || line.overridden) && (
        <div className="flex items-center justify-between gap-3 py-1.5 border-t border-ink-700/60">
          <span className="text-xs text-ink-400">Entered manually earlier</span>
          <AmountField
            value={base}
            onChange={(n) => setIncomeOverride(source.id, monthKey, n > 0 ? n : null)}
            currency={currency}
            compact
            className="w-32"
            title={`${source.name} · entered manually`}
          />
        </div>
      )}

      {payments.map((p) => (
        <button
          key={p.id}
          onClick={() => onEditPayment(p)}
          className="w-full flex items-center gap-3 py-1.5 border-t border-ink-700/60 text-left"
        >
          <span className="text-xs text-ink-500 w-12 shrink-0">{formatShortDate(p.date)}</span>
          <span className="flex-1 text-sm text-ink-300 truncate">{p.note || 'Payment'}</span>
          <span className="text-sm text-ink-100 tabular-nums">{formatMoney(p.amount, currency)}</span>
        </button>
      ))}

      <button
        onClick={onAddPayment}
        className="mt-2 w-full py-2 rounded-lg bg-brand-500/15 text-brand-400 text-sm font-medium active:scale-[0.99] transition"
      >
        + Add payment
      </button>
    </div>
  )
}

function FixedLine({
  line,
  currency,
  monthKey,
  monthName,
  cycleLabel,
  onEditSource,
}: {
  line: ResolvedIncomeLine
  currency: string
  monthKey: string
  monthName: string
  cycleLabel: string
  onEditSource: () => void
}) {
  const { source, amount, overridden } = line
  return (
    <div className="rounded-xl bg-ink-800 border border-ink-700 px-3 py-2.5">
      <div className="flex items-center gap-2 mb-2">
        <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: source.color }} />
        <button onClick={onEditSource} className="text-sm text-ink-100 flex-1 text-left">
          {source.name}
        </button>
        {overridden ? (
          <button onClick={() => setIncomeOverride(source.id, monthKey, null)} className="text-xs text-brand-400">
            set for {monthName} · reset
          </button>
        ) : (
          <span className="text-xs text-ink-500">default</span>
        )}
      </div>
      <AmountField
        value={amount}
        onChange={(n) => setIncomeOverride(source.id, monthKey, n)}
        currency={currency}
        title={`${source.name} · ${cycleLabel}`}
      />
    </div>
  )
}

function PaymentEditor({
  source,
  payment,
  defaultDate,
  currency,
  onClose,
}: {
  source: IncomeSource
  payment: IncomePayment | null
  defaultDate: string
  currency: string
  onClose: () => void
}) {
  const [amount, setAmount] = useState(payment?.amount ?? 0)
  const [date, setDate] = useState(payment?.date ?? defaultDate)
  const [note, setNote] = useState(payment?.note ?? '')

  async function save() {
    if (!(amount > 0)) return
    if (payment) await updateIncomePayment(payment.id, { amount, date, note: note.trim() })
    else await addIncomePayment({ sourceId: source.id, amount, date, note })
    onClose()
  }

  async function remove() {
    if (payment) await deleteIncomePayment(payment.id)
    onClose()
  }

  return (
    <Sheet open onClose={onClose} title={payment ? 'Edit payment' : `Add payment · ${source.name}`}>
      <div className="space-y-4">
        <AmountField
          value={amount}
          onChange={setAmount}
          currency={currency}
          title="Payment received"
          big
          autoOpen={!payment}
        />
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="Client / invoice (optional)"
          className="w-full bg-ink-800 border border-ink-700 rounded-xl px-3 py-2.5 text-sm text-ink-100 placeholder:text-ink-500 focus:outline-none focus:border-brand-500"
        />
        <label className="flex items-center justify-between gap-3 bg-ink-800 border border-ink-700 rounded-xl px-3 py-2.5 text-sm">
          <span className="text-ink-400">Date received</span>
          <input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value || defaultDate)}
            className="bg-transparent text-ink-100 focus:outline-none"
          />
        </label>
        <div className="flex gap-2 pt-2">
          {payment && (
            <button onClick={remove} className="px-4 py-3 rounded-xl border border-bad/40 text-bad text-sm">
              Delete
            </button>
          )}
          <button
            onClick={save}
            disabled={!(amount > 0)}
            className="flex-1 py-3 rounded-xl bg-brand-500 text-ink-950 font-semibold disabled:opacity-40"
          >
            {payment ? 'Save' : 'Add payment'}
          </button>
        </div>
      </div>
    </Sheet>
  )
}

function SourceEditor({
  source,
  currency,
  onClose,
}: {
  source: IncomeSource | null
  currency: string
  onClose: () => void
}) {
  const [name, setName] = useState(source?.name ?? '')
  const [amount, setAmount] = useState(String(source?.defaultAmount ?? ''))
  const [color, setColor] = useState(source?.color ?? COLORS[0])
  const [track, setTrack] = useState(!!source?.trackPayments)

  async function save() {
    if (!name.trim()) return
    const defaultAmount = parseFloat(amount || '0')
    if (!source) {
      await upsertIncomeSource({
        name: name.trim(),
        defaultAmount: track ? 0 : defaultAmount,
        color,
        active: true,
        trackPayments: track,
      })
    } else {
      await upsertIncomeSource({ id: source.id, name: name.trim(), defaultAmount, color, active: source.active })
      // Store the choice explicitly (even "Fixed monthly" on a never-decided
      // stream) so the + screen never has to guess.
      if (source.trackPayments !== track) await setTrackPayments(source.id, track)
    }
    onClose()
  }

  async function remove() {
    if (!source) return
    await deleteIncomeSource(source.id)
    onClose()
  }

  return (
    <Sheet open onClose={onClose} title={source ? 'Edit stream' : 'New income stream'}>
      <div className="space-y-4">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Name (e.g. Salary, Rental, Business)"
          autoFocus
          className="w-full bg-ink-800 border border-ink-700 rounded-xl px-3 py-2.5 text-ink-100 focus:outline-none focus:border-brand-500"
        />

        <div>
          <div className="text-xs text-ink-400 mb-1.5">How is this income recorded?</div>
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => setTrack(false)}
              className={`py-2.5 rounded-xl border text-sm ${!track ? 'border-brand-500 bg-brand-500/15 text-brand-400' : 'border-ink-700 text-ink-300'}`}
            >
              Fixed monthly
            </button>
            <button
              onClick={() => setTrack(true)}
              className={`py-2.5 rounded-xl border text-sm ${track ? 'border-brand-500 bg-brand-500/15 text-brand-400' : 'border-ink-700 text-ink-300'}`}
            >
              Log payments
            </button>
          </div>
          <p className="text-xs text-ink-500 mt-1.5">
            {track
              ? "For income that varies, like business revenue. Add each payment as it comes in and the month totals itself. Amounts you've already recorded — including this month's so far — are kept, and new payments add on top."
              : 'For steady income like salary or rent. One amount each month, which you can adjust for any single month.'}
          </p>
        </div>

        {!track && (
          <div>
            <div className="text-xs text-ink-400 mb-1.5">Typical monthly amount</div>
            <AmountField
              value={amount === '' ? 0 : parseFloat(amount)}
              onChange={(n) => setAmount(String(n))}
              currency={currency}
              title="Typical monthly amount"
            />
            <p className="text-xs text-ink-500 mt-1.5">
              The default used every month. Override individual months from the Income screen.
            </p>
          </div>
        )}

        <div>
          <div className="text-xs text-ink-400 mb-1.5">Colour</div>
          <div className="flex flex-wrap gap-2">
            {COLORS.map((c) => (
              <button
                key={c}
                onClick={() => setColor(c)}
                className={`h-8 w-8 rounded-full ${color === c ? 'ring-2 ring-white ring-offset-2 ring-offset-ink-900' : ''}`}
                style={{ backgroundColor: c }}
              />
            ))}
          </div>
        </div>
        <div className="flex gap-2 pt-2">
          {source && (
            <button onClick={remove} className="px-4 py-3 rounded-xl border border-ink-700 text-bad text-sm">
              Delete
            </button>
          )}
          <button onClick={save} className="flex-1 py-3 rounded-xl bg-brand-500 text-ink-950 font-semibold">
            Save
          </button>
        </div>
      </div>
    </Sheet>
  )
}
