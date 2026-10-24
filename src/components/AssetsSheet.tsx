import { useState } from 'react'
import Sheet from './Sheet'
import AmountField from './AmountField'
import { useAssets, useSettings } from '../hooks/useData'
import { deleteAsset, saveAsset, setAssetValue } from '../lib/repo'
import { assetValue, summarizeWorth } from '../lib/wins'
import { formatMoney, formatShortDate } from '../lib/format'
import type { Asset, AssetKind } from '../lib/types'

const KINDS: { value: AssetKind; label: string; color: string; hint: string; placeholder: string }[] = [
  {
    value: 'savings',
    label: 'Cash & savings',
    color: '#22c55e',
    hint: 'Bank accounts and savings you can reach quickly. Together they make your safety net.',
    placeholder: 'e.g. Maybank current account, Fixed deposit',
  },
  {
    value: 'investment',
    label: 'Investment',
    color: '#a855f7',
    hint: "Can grow by itself every month, like a DCA. Retirement funds like EPF go here too: they count toward your net worth, but not your safety net, since they can't be used in an emergency.",
    placeholder: 'e.g. Eastspring, EPF, ASB',
  },
  { value: 'property', label: 'Property', color: '#0ea5e9', hint: "What it's worth today.", placeholder: 'e.g. House, Apartment' },
  { value: 'other', label: 'Other', color: '#f59e0b', hint: 'Anything else you own of value.', placeholder: 'e.g. Car, Gold' },
  { value: 'debt', label: 'Owed', color: '#64748b', hint: 'Loans you owe. Subtracted from your net worth.', placeholder: 'e.g. Car loan' },
]
const kindOf = (k: AssetKind) => KINDS.find((x) => x.value === k) ?? KINDS[0]

// One-tap shortcuts for common Malaysian money "pockets"; each opens the editor
// pre-filled. Only the ones not added yet are shown.
const POCKETS: { name: string; kind: AssetKind }[] = [
  { name: 'Maybank current account', kind: 'savings' },
  { name: 'Grab bank', kind: 'savings' },
  { name: 'Boost bank', kind: 'savings' },
  { name: 'Fixed deposit', kind: 'savings' },
  { name: 'Eastspring', kind: 'investment' },
  { name: 'EPF', kind: 'investment' },
  { name: 'Public Mutual PRS', kind: 'investment' },
]

type Editing = { asset: Asset | null; preset?: { name: string; kind: AssetKind } }

// Your net worth, built from what you own and what's growing. Tap any amount to
// update it; automatic monthly contributions add themselves.
export default function AssetsSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const assets = useAssets()
  const settings = useSettings()
  const currency = settings?.currency ?? 'RM'
  const [editing, setEditing] = useState<Editing | null>(null)

  const worth = summarizeWorth(assets ?? [])
  const have = new Set((assets ?? []).map((a) => a.name.trim().toLowerCase()))
  const suggestions = POCKETS.filter((p) => !have.has(p.name.toLowerCase()))
  const grouped = KINDS.map((k) => ({ kind: k, items: (assets ?? []).filter((a) => a.kind === k.value) })).filter(
    (g) => g.items.length > 0,
  )

  return (
    <Sheet open={open} onClose={onClose} title="Net worth & savings" full>
      <div className="rounded-2xl bg-gradient-to-br from-good/15 to-ink-900 border border-good/25 p-4 mb-4">
        <div className="text-xs text-ink-400">Your net worth</div>
        <div className="text-3xl font-bold text-ink-100 tabular-nums mt-0.5">{formatMoney(worth.netWorth, currency)}</div>
        <div className="mt-2 space-y-0.5 text-xs text-ink-400">
          {worth.safetyNet > 0 && <div>Safety net: {formatMoney(worth.safetyNet, currency)}</div>}
          {worth.monthlyInvesting > 0 && (
            <div className="text-good">+{formatMoney(worth.monthlyInvesting, currency)} added automatically every month</div>
          )}
          {worth.debts > 0 && <div>Owed: {formatMoney(worth.debts, currency)} (already subtracted)</div>}
        </div>
      </div>

      {grouped.length === 0 && (
        <p className="text-sm text-ink-400 mb-4">
          Add what you have: savings, investments, anything of value. Watch it grow alongside your spending, not
          just the spending on its own.
        </p>
      )}

      <div className="space-y-4 mb-4">
        {grouped.map(({ kind, items }) => (
          <div key={kind.value}>
            <div className="text-xs font-semibold text-ink-400 uppercase tracking-wide mb-1.5">{kind.label}</div>
            <div className="space-y-2">
              {items.map((a) => (
                <div key={a.id} className="flex items-center gap-3 rounded-xl bg-ink-800 border border-ink-700 px-3 py-2.5">
                  <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: a.color }} />
                  <button onClick={() => setEditing({ asset: a })} className="flex-1 min-w-0 text-left">
                    <div className="text-sm text-ink-100 truncate">{a.name}</div>
                    <div className="text-[11px] text-ink-500 truncate">
                      {a.monthlyAdd
                        ? `+${formatMoney(a.monthlyAdd, currency)} on the ${ordinal(a.addDay ?? 1)} · `
                        : ''}
                      updated {formatShortDate(a.asOf)}
                    </div>
                  </button>
                  <AmountField
                    value={assetValue(a)}
                    onChange={(n) => setAssetValue(a.id, n)}
                    currency={currency}
                    compact
                    className="w-36"
                    title={`Update · ${a.name}`}
                  />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>

      {suggestions.length > 0 && (
        <div className="mb-3">
          <div className="text-xs text-ink-400 mb-1.5">Quick add</div>
          <div className="flex flex-wrap gap-2">
            {suggestions.map((p) => (
              <button
                key={p.name}
                onClick={() => setEditing({ asset: null, preset: p })}
                className="px-3 py-1.5 rounded-full border border-ink-700 bg-ink-800 text-sm text-ink-200"
              >
                + {p.name}
              </button>
            ))}
          </div>
        </div>
      )}

      <button
        onClick={() => setEditing({ asset: null })}
        className="w-full py-3 rounded-xl border border-dashed border-ink-600 text-ink-300 text-sm"
      >
        + Add something else
      </button>

      <p className="text-xs text-ink-500 mt-3">
        Tap any amount to update it, for example after a withdrawal or when you check a statement. Monthly
        contributions add themselves, so you never have to enter them.
      </p>

      {editing && (
        <AssetEditor asset={editing.asset} preset={editing.preset} currency={currency} onClose={() => setEditing(null)} />
      )}
    </Sheet>
  )
}

function AssetEditor({
  asset,
  preset,
  currency,
  onClose,
}: {
  asset: Asset | null
  preset?: { name: string; kind: AssetKind }
  currency: string
  onClose: () => void
}) {
  const [name, setName] = useState(asset?.name ?? preset?.name ?? '')
  const [kind, setKind] = useState<AssetKind>(asset?.kind ?? preset?.kind ?? 'savings')
  const [value, setValue] = useState(asset ? assetValue(asset) : 0)
  const [auto, setAuto] = useState(!!asset?.monthlyAdd)
  const [monthlyAdd, setMonthlyAdd] = useState(asset?.monthlyAdd ?? 0)
  const [addDay, setAddDay] = useState(asset?.addDay ?? 1)
  const [inSafetyNet, setInSafetyNet] = useState(!!asset?.inSafetyNet)
  const k = kindOf(kind)
  const canAuto = kind !== 'debt'

  async function save() {
    if (!name.trim()) return
    await saveAsset({
      id: asset?.id,
      name: name.trim(),
      kind,
      value,
      monthlyAdd: canAuto && auto ? monthlyAdd : 0,
      addDay,
      inSafetyNet,
      color: asset && asset.kind === kind ? asset.color : k.color,
    })
    onClose()
  }

  async function remove() {
    if (asset) await deleteAsset(asset.id)
    onClose()
  }

  return (
    <Sheet open onClose={onClose} title={asset ? 'Edit' : 'Add to your net worth'}>
      <div className="space-y-4">
        <div className="flex flex-wrap gap-2">
          {KINDS.map((x) => (
            <button
              key={x.value}
              onClick={() => setKind(x.value)}
              className={`px-3 py-1.5 rounded-full border text-sm ${
                kind === x.value ? 'border-good bg-good/15 text-good' : 'border-ink-700 bg-ink-800 text-ink-300'
              }`}
            >
              {x.label}
            </button>
          ))}
        </div>
        <p className="text-xs text-ink-500 -mt-2">{k.hint}</p>

        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={k.placeholder}
          className="w-full bg-ink-800 border border-ink-700 rounded-xl px-3 py-2.5 text-ink-100 placeholder:text-ink-500 focus:outline-none focus:border-brand-500"
        />

        <div>
          <div className="text-xs text-ink-400 mb-1.5">{kind === 'debt' ? 'Amount still owed' : "What it's worth now"}</div>
          <AmountField value={value} onChange={setValue} currency={currency} title={name || k.label} big />
        </div>

        {kind === 'investment' && (
          <div className="rounded-xl bg-ink-800 border border-ink-700 p-3">
            <label className="flex items-center justify-between gap-3">
              <span className="text-sm text-ink-200">Count in my safety net</span>
              <input
                type="checkbox"
                checked={inSafetyNet}
                onChange={(e) => setInSafetyNet(e.target.checked)}
                className="h-5 w-5 accent-emerald-400"
              />
            </label>
            <p className="text-xs text-ink-500 mt-1.5">
              Only if you'd actually reach for it in an emergency. Leave it off for money you don't plan to touch,
              like EPF or PRS. It still counts in your net worth either way.
            </p>
          </div>
        )}

        {canAuto && (
          <div className="rounded-xl bg-ink-800 border border-ink-700 p-3">
            <label className="flex items-center justify-between gap-3">
              <span className="text-sm text-ink-200">Adds automatically every month</span>
              <input type="checkbox" checked={auto} onChange={(e) => setAuto(e.target.checked)} className="h-5 w-5 accent-emerald-400" />
            </label>
            {auto && (
              <div className="mt-3 space-y-2">
                <AmountField value={monthlyAdd} onChange={setMonthlyAdd} currency={currency} title="Monthly contribution" />
                <div className="flex items-center gap-2 text-sm text-ink-300">
                  On day
                  <select
                    value={addDay}
                    onChange={(e) => setAddDay(Number(e.target.value))}
                    className="bg-ink-900 border border-ink-700 rounded-lg px-3 py-2 text-ink-100"
                  >
                    {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => (
                      <option key={d} value={d}>
                        {d}
                      </option>
                    ))}
                  </select>
                  of each month
                </div>
                <p className="text-xs text-ink-500">
                  For example, your DCA. It's added on that day each month, starting from the next one. If the
                  value ever differs (market moves, a withdrawal), just update the amount.
                </p>
              </div>
            )}
          </div>
        )}

        <div className="flex gap-2 pt-2">
          {asset && (
            <button onClick={remove} className="px-4 py-3 rounded-xl border border-ink-700 text-ink-400 text-sm">
              Remove
            </button>
          )}
          <button
            onClick={save}
            disabled={!name.trim()}
            className="flex-1 py-3 rounded-xl bg-good text-ink-950 font-semibold disabled:opacity-40"
          >
            Save
          </button>
        </div>
      </div>
    </Sheet>
  )
}

export function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd']
  const v = n % 100
  return n + (s[(v - 20) % 10] || s[v] || s[0])
}
