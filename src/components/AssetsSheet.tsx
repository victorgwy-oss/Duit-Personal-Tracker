import { useState } from 'react'
import Sheet from './Sheet'
import AmountField from './AmountField'
import { useAssets, useSettings } from '../hooks/useData'
import { deleteAsset, saveAsset, setAssetValue } from '../lib/repo'
import { arrangeAssets, assetValue, summarizeWorth } from '../lib/wins'
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

type Preset = { name: string; kind: AssetKind; group?: string }
type Editing = { asset: Asset | null; preset?: Preset }


// Your net worth, built from what you own and what's growing. Tap any amount to
// update it; automatic monthly contributions add themselves.
export default function AssetsSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const assets = useAssets()
  const settings = useSettings()
  const currency = settings?.currency ?? 'RM'
  const [editing, setEditing] = useState<Editing | null>(null)

  const worth = summarizeWorth(assets ?? [])
  const groupKeys = new Set((assets ?? []).map((a) => a.group?.trim().toLowerCase()).filter((g): g is string => !!g))
  const have = new Set([...(assets ?? []).map((a) => a.name.trim().toLowerCase()), ...groupKeys])
  const suggestions = POCKETS.filter((p) => !have.has(p.name.toLowerCase()))
  const groupNames = [
    ...new Set(
      (assets ?? [])
        .flatMap((a) => (a.group ? [a.group.trim()] : a.kind !== 'debt' ? [a.name.trim()] : []))
        .filter(Boolean),
    ),
  ]
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
              {arrangeAssets(items, groupKeys).map((e) =>
                e.type === 'single' ? (
                  <AssetRow key={e.asset.id} a={e.asset} currency={currency} onEdit={() => setEditing({ asset: e.asset })} />
                ) : (
                  <div key={`g:${e.name}`} className="rounded-xl border border-ink-700 bg-ink-800/40 p-2 space-y-2">
                    <div className="flex items-center justify-between px-1">
                      <span className="text-sm font-medium text-ink-100">{e.name}</span>
                      <span className="text-sm tabular-nums text-ink-200">
                        {formatMoney(e.members.reduce((s, m) => s + assetValue(m), 0), currency)}
                      </span>
                    </div>
                    {e.members.map((m) => (
                      <AssetRow key={m.id} a={m} currency={currency} onEdit={() => setEditing({ asset: m })} />
                    ))}
                    <button
                      onClick={() =>
                        setEditing({ asset: null, preset: { name: '', kind: e.members[0].kind, group: e.name } })
                      }
                      className="w-full text-xs text-brand-400 font-medium py-1"
                    >
                      + Add another pocket to {e.name}
                    </button>
                  </div>
                ),
              )}
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
        <AssetEditor
          key={editing.asset?.id ?? `new:${editing.preset?.group ?? ''}:${editing.preset?.name ?? ''}`}
          asset={editing.asset}
          preset={editing.preset}
          groupNames={groupNames}
          currency={currency}
          onClose={() => setEditing(null)}
          onAddInside={(a) =>
            setEditing({ asset: null, preset: { name: '', kind: a.kind, group: a.group?.trim() || a.name.trim() } })
          }
        />
      )}
    </Sheet>
  )
}

function AssetRow({ a, currency, onEdit }: { a: Asset; currency: string; onEdit: () => void }) {
  return (
    <div className="flex items-center gap-3 rounded-xl bg-ink-800 border border-ink-700 px-3 py-2.5">
      <span className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: a.color }} />
      <button onClick={onEdit} className="flex-1 min-w-0 text-left">
        <div className="text-sm text-ink-100 truncate">{a.name}</div>
        <div className="text-[11px] text-ink-500 truncate">
          {a.monthlyAdd ? `+${formatMoney(a.monthlyAdd, currency)} on the ${ordinal(a.addDay ?? 1)} · ` : ''}
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
  )
}

function AssetEditor({
  asset,
  preset,
  groupNames,
  currency,
  onClose,
  onAddInside,
}: {
  asset: Asset | null
  preset?: Preset
  groupNames: string[]
  currency: string
  onClose: () => void
  onAddInside: (a: Asset) => void
}) {
  const [name, setName] = useState(asset?.name ?? preset?.name ?? '')
  const [kind, setKind] = useState<AssetKind>(asset?.kind ?? preset?.kind ?? 'savings')
  const [group, setGroup] = useState(asset?.group ?? preset?.group ?? '')
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
      group,
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
          placeholder={group ? `e.g. a fund inside ${group}` : k.placeholder}
          className="w-full bg-ink-800 border border-ink-700 rounded-xl px-3 py-2.5 text-ink-100 placeholder:text-ink-500 focus:outline-none focus:border-brand-500"
        />

        {kind !== 'debt' && (
          <div>
            <div className="text-xs text-ink-400 mb-1.5">Part of (optional)</div>
            <input
              value={group}
              onChange={(e) => setGroup(e.target.value)}
              list="asset-groups"
              placeholder="e.g. Boost bank, Eastspring"
              className="w-full bg-ink-800 border border-ink-700 rounded-xl px-3 py-2.5 text-sm text-ink-100 placeholder:text-ink-500 focus:outline-none focus:border-brand-500"
            />
            <datalist id="asset-groups">
              {groupNames
                .filter((g) => g.toLowerCase() !== name.trim().toLowerCase())
                .map((g) => (
                  <option key={g} value={g} />
                ))}
            </datalist>
            <p className="text-xs text-ink-500 mt-1.5">
              Pockets with the same "Part of" show together with a subtotal, for example jars inside Boost or
              funds inside Eastspring. Give each pocket its own amount (say, Boost's main balance without the
              jars), so nothing is counted twice.
            </p>
          </div>
        )}

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
          {asset && asset.kind !== 'debt' && (
            <button
              onClick={() => onAddInside(asset)}
              className="px-3 py-3 rounded-xl border border-ink-700 text-brand-400 text-sm"
            >
              + Pocket inside
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
