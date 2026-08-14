import { useEffect, useState } from 'react'
import { useAccounts, useCategories, useRecurring, useSettings } from '../hooks/useData'
import { upsertRecurring, deleteRecurring } from '../lib/repo'
import { pendingConfirmations, confirmPending, skipPending, type PendingConfirm } from '../lib/autopost'
import { cadenceLabel, monthlyEquivalent, monthlyCommitment } from '../lib/recurring'
import { formatMoney, formatShortDate, todayISO } from '../lib/format'
import { uid } from '../db'
import Sheet from '../components/Sheet'
import { CheckIcon, CloseIcon } from '../components/icons'
import type { Cadence, RecurringMode, RecurringRule } from '../lib/types'

export default function RecurringScreen() {
  const rules = useRecurring()
  const settings = useSettings()
  const [editing, setEditing] = useState<RecurringRule | 'new' | null>(null)
  const [pending, setPending] = useState<PendingConfirm[]>([])
  const currency = settings?.currency ?? 'RM'

  const activeRules = (rules ?? []).filter((r) => r.active)
  const monthlyTotal = monthlyCommitment(rules ?? [])
  const hasNonMonthly = activeRules.some((r) => r.cadence !== 'monthly')

  async function refreshPending() {
    setPending(await pendingConfirmations())
  }
  useEffect(() => {
    refreshPending()
  }, [rules])

  return (
    <div className="px-5 pt-6 safe-top">
      <h1 className="text-2xl font-bold text-ink-100 mb-1">Recurring</h1>
      <p className="text-sm text-ink-400 mb-5">
        Set these once — insurance, subscriptions, bills. They post themselves each month, even when the app is closed.
      </p>

      {/* Fixed cost per month: what you're committed to before any spending */}
      {activeRules.length > 0 && (
        <div className="rounded-2xl bg-gradient-to-br from-ink-800 to-ink-900 border border-ink-800 p-4 mb-5">
          <div className="text-xs text-ink-400">Fixed cost every month</div>
          <div className="text-3xl font-bold text-ink-100 tabular-nums mt-0.5">
            {formatMoney(monthlyTotal, currency)}
          </div>
          <div className="text-xs text-ink-500 mt-0.5">
            {activeRules.length} recurring charge{activeRules.length > 1 ? 's' : ''}
            {hasNonMonthly ? ' · weekly & yearly averaged to a monthly figure' : ' · due even if you spend nothing else'}
          </div>
        </div>
      )}

      {/* Review tray for confirm-mode rules */}
      {pending.length > 0 && (
        <section className="mb-6">
          <h3 className="text-sm font-semibold text-warn mb-2">Waiting for your OK</h3>
          <div className="space-y-2">
            {pending.map((p) => (
              <div key={p.rule.id} className="bg-warn/10 border border-warn/30 rounded-xl p-3">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-ink-100 font-medium">{p.rule.name}</span>
                  <span className="text-sm text-ink-100 tabular-nums">{formatMoney(p.total, currency)}</span>
                </div>
                <div className="text-xs text-ink-400 mt-0.5">
                  {p.dates.length} charge{p.dates.length > 1 ? 's' : ''} due · {p.dates.map(formatShortDate).join(', ')}
                </div>
                <div className="flex gap-2 mt-2">
                  <button
                    onClick={async () => {
                      await confirmPending(p.rule, p.dates)
                      refreshPending()
                    }}
                    className="flex-1 py-2 rounded-lg bg-good/20 text-good text-sm flex items-center justify-center gap-1"
                  >
                    <CheckIcon width={16} height={16} /> Add {p.dates.length > 1 ? 'all' : ''}
                  </button>
                  <button
                    onClick={async () => {
                      for (const d of p.dates) await skipPending(p.rule, d)
                      refreshPending()
                    }}
                    className="flex-1 py-2 rounded-lg bg-ink-800 text-ink-400 text-sm flex items-center justify-center gap-1"
                  >
                    <CloseIcon width={16} height={16} /> Skip
                  </button>
                </div>
              </div>
            ))}
          </div>
        </section>
      )}

      <div className="space-y-2 mb-4">
        {(rules ?? []).filter((r) => r.active).map((r) => (
          <button
            key={r.id}
            onClick={() => setEditing(r)}
            className="w-full flex items-center gap-3 px-3 py-3 rounded-xl bg-ink-800 border border-ink-700 text-left"
          >
            <div className="flex-1">
              <div className="text-sm text-ink-100 font-medium">{r.name}</div>
              <div className="text-xs text-ink-500">
                {cadenceLabel(r)} · {r.mode === 'auto' ? 'auto-posts' : 'asks first'}
              </div>
            </div>
            <div className="text-right">
              <span className="text-sm font-medium text-ink-100 tabular-nums">{formatMoney(r.amount, currency)}</span>
              {r.cadence !== 'monthly' && (
                <div className="text-xs text-ink-500 tabular-nums">
                  ≈ {formatMoney(monthlyEquivalent(r), currency)}/mo
                </div>
              )}
            </div>
          </button>
        ))}
      </div>

      <button
        onClick={() => setEditing('new')}
        className="w-full py-3 rounded-xl border border-dashed border-ink-600 text-ink-300 text-sm"
      >
        + Add recurring charge
      </button>

      {editing && (
        <RuleEditor
          rule={editing === 'new' ? null : editing}
          onClose={() => {
            setEditing(null)
            refreshPending()
          }}
        />
      )}
    </div>
  )
}

function RuleEditor({ rule, onClose }: { rule: RecurringRule | null; onClose: () => void }) {
  const accounts = useAccounts()
  const categories = useCategories()
  const [name, setName] = useState(rule?.name ?? '')
  const [amount, setAmount] = useState(String(rule?.amount ?? ''))
  const [accountId, setAccountId] = useState(rule?.accountId ?? '')
  const [categoryId, setCategoryId] = useState(rule?.categoryId ?? '')
  const [cadence, setCadence] = useState<Cadence>(rule?.cadence ?? 'monthly')
  const [dayOfMonth, setDayOfMonth] = useState(rule?.dayOfMonth ?? 1)
  const [mode, setMode] = useState<RecurringMode>(rule?.mode ?? 'auto')
  const [startDate, setStartDate] = useState(rule?.startDate ?? todayISO())

  useEffect(() => {
    if (!accountId && accounts?.[0]) setAccountId(accounts[0].id)
    if (!categoryId) {
      const fixed = categories?.find((c) => c.group === 'fixed')
      if (fixed) setCategoryId(fixed.id)
      else if (categories?.[0]) setCategoryId(categories[0].id)
    }
  }, [accounts, categories, accountId, categoryId])

  const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

  async function save() {
    if (!name.trim() || !accountId || !categoryId) return
    await upsertRecurring({
      id: rule?.id ?? uid(),
      name: name.trim(),
      amount: parseFloat(amount || '0'),
      accountId,
      categoryId,
      cadence,
      dayOfMonth,
      startDate,
      active: true,
      mode,
      lastPostedPeriod: rule?.lastPostedPeriod ?? null,
    })
    onClose()
  }

  async function remove() {
    if (rule) await deleteRecurring(rule.id)
    onClose()
  }

  return (
    <Sheet open onClose={onClose} title={rule ? 'Edit recurring' : 'New recurring charge'} full>
      <div className="space-y-4">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Name (e.g. Netflix, Car insurance)"
          className="w-full bg-ink-800 border border-ink-700 rounded-xl px-3 py-2.5 text-ink-100 focus:outline-none focus:border-brand-500"
        />
        <div className="flex items-center bg-ink-800 border border-ink-700 rounded-xl px-3 py-2.5">
          <span className="text-ink-500 mr-2">RM</span>
          <input
            type="number"
            inputMode="decimal"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="0.00"
            className="flex-1 bg-transparent text-lg font-semibold text-ink-100 focus:outline-none"
          />
        </div>

        <Labeled label="Wallet">
          <div className="grid grid-cols-2 gap-2">
            {(accounts ?? []).map((a) => (
              <button
                key={a.id}
                onClick={() => setAccountId(a.id)}
                className={`py-2.5 rounded-xl border text-sm ${accountId === a.id ? 'border-brand-500 bg-brand-500/15 text-brand-400' : 'border-ink-700 text-ink-300'}`}
              >
                {a.name}
              </button>
            ))}
          </div>
        </Labeled>

        <Labeled label="Category">
          <div className="flex flex-wrap gap-2">
            {(categories ?? []).map((c) => (
              <button
                key={c.id}
                onClick={() => setCategoryId(c.id)}
                className={`px-3 py-1.5 rounded-full border text-sm flex items-center gap-1 ${categoryId === c.id ? 'border-brand-500 bg-brand-500/15 text-brand-400' : 'border-ink-700 text-ink-300'}`}
              >
                <span>{c.icon}</span> {c.name}
              </button>
            ))}
          </div>
        </Labeled>

        <Labeled label="How often">
          <div className="grid grid-cols-3 gap-2 mb-3">
            {(['weekly', 'monthly', 'annual'] as const).map((c) => (
              <button
                key={c}
                onClick={() => setCadence(c)}
                className={`py-2 rounded-lg text-sm capitalize ${cadence === c ? 'bg-brand-500 text-ink-950' : 'bg-ink-800 text-ink-300'}`}
              >
                {c}
              </button>
            ))}
          </div>
          {cadence === 'weekly' ? (
            <div className="flex gap-1">
              {DOW.map((d, i) => (
                <button
                  key={d}
                  onClick={() => setDayOfMonth(i)}
                  className={`flex-1 py-2 rounded-lg text-xs ${dayOfMonth === i ? 'bg-brand-500 text-ink-950' : 'bg-ink-800 text-ink-300'}`}
                >
                  {d}
                </button>
              ))}
            </div>
          ) : cadence === 'monthly' ? (
            <div>
              <div className="flex items-center gap-2 text-sm text-ink-300">
                On day
                <select
                  value={dayOfMonth}
                  onChange={(e) => setDayOfMonth(Number(e.target.value))}
                  className="bg-ink-800 border border-ink-700 rounded-lg px-3 py-2 text-ink-100"
                >
                  {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => (
                    <option key={d} value={d}>{d}</option>
                  ))}
                </select>
                of each month
              </div>
              {dayOfMonth > 28 && (
                <p className="text-xs text-ink-500 mt-1.5">
                  Shorter months post on their last day (e.g. day {dayOfMonth} → Feb 28).
                </p>
              )}
            </div>
          ) : (
            <div className="flex items-center gap-2 text-sm text-ink-300">
              Renews on
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="bg-ink-800 border border-ink-700 rounded-lg px-3 py-2 text-ink-100"
              />
            </div>
          )}
        </Labeled>

        <Labeled label="Start from">
          <input
            type="date"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            className="w-full bg-ink-800 border border-ink-700 rounded-xl px-3 py-2.5 text-ink-100 focus:outline-none focus:border-brand-500"
          />
        </Labeled>

        <Labeled label="When it's due">
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => setMode('auto')}
              className={`py-2.5 rounded-xl border text-sm ${mode === 'auto' ? 'border-brand-500 bg-brand-500/15 text-brand-400' : 'border-ink-700 text-ink-300'}`}
            >
              Post automatically
            </button>
            <button
              onClick={() => setMode('confirm')}
              className={`py-2.5 rounded-xl border text-sm ${mode === 'confirm' ? 'border-brand-500 bg-brand-500/15 text-brand-400' : 'border-ink-700 text-ink-300'}`}
            >
              Ask me first
            </button>
          </div>
          <p className="text-xs text-ink-500 mt-1.5">
            {mode === 'auto'
              ? 'Fixed amounts like insurance — recorded without asking.'
              : 'Variable bills — you approve each one from the review tray.'}
          </p>
        </Labeled>

        <div className="flex gap-2 pt-2">
          {rule && (
            <button onClick={remove} className="px-4 py-3 rounded-xl border border-bad/40 text-bad text-sm">
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

function Labeled({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs font-medium text-ink-400 mb-1.5">{label}</div>
      {children}
    </div>
  )
}
