import { useState } from 'react'
import Sheet from '../components/Sheet'
import AmountField from '../components/AmountField'
import { useAccounts, useCategories } from '../hooks/useData'
import { upsertAccount, upsertCategory } from '../lib/repo'
import { db } from '../db'
import type { Category, CategoryGroup, WalletType } from '../lib/types'
import { WALLET_TYPES, walletTypeLabel } from '../lib/types'

const EMOJIS = ['🍜', '🛒', '🚗', '🛍️', '👨‍👩‍👧', '✈️', '🛡️', '🔁', '💡', '🏠', '🎬', '💊', '🎁', '☕', '⛽', '📱', '❓']
const COLORS = ['#f59e0b', '#84cc16', '#06b6d4', '#a855f7', '#ec4899', '#14b8a6', '#6366f1', '#8b5cf6', '#0ea5e9', '#64748b', '#f472b6', '#3b82f6']

export default function ManageLists({ open, onClose }: { open: boolean; onClose: () => void }) {
  const categories = useCategories()
  const accounts = useAccounts()
  const [tab, setTab] = useState<'categories' | 'wallets'>('categories')

  return (
    <Sheet open={open} onClose={onClose} title="Manage" full>
      <div className="flex gap-2 mb-4">
        {(['categories', 'wallets'] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex-1 py-2 rounded-lg text-sm capitalize ${tab === t ? 'bg-brand-500 text-ink-950 font-medium' : 'bg-ink-800 text-ink-300'}`}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === 'categories' ? (
        <CategoryManager categories={categories} />
      ) : (
        <WalletManager accounts={accounts} />
      )}
    </Sheet>
  )
}

function CategoryManager({ categories }: { categories: Category[] | undefined }) {
  const [editing, setEditing] = useState<Category | 'new' | null>(null)

  return (
    <div>
      <div className="space-y-2 mb-4">
        {(categories ?? []).map((c) => (
          <button
            key={c.id}
            onClick={() => setEditing(c)}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl bg-ink-800 border border-ink-700 text-left"
          >
            <span className="text-lg">{c.icon}</span>
            <span className="flex-1 text-sm text-ink-100">{c.name}</span>
            <span className="text-xs text-ink-500 capitalize">{c.group}</span>
            {c.monthlyBudget > 0 && <span className="text-xs text-brand-400">RM{c.monthlyBudget}</span>}
          </button>
        ))}
      </div>
      <button
        onClick={() => setEditing('new')}
        className="w-full py-3 rounded-xl border border-dashed border-ink-600 text-ink-300 text-sm"
      >
        + Add category
      </button>

      {editing && <CategoryEditor category={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
    </div>
  )
}

function CategoryEditor({ category, onClose }: { category: Category | null; onClose: () => void }) {
  const [name, setName] = useState(category?.name ?? '')
  const [group, setGroup] = useState<CategoryGroup>(category?.group ?? 'discretionary')
  const [budget, setBudget] = useState(String(category?.monthlyBudget ?? 0))
  const [icon, setIcon] = useState(category?.icon ?? '❓')
  const [color, setColor] = useState(category?.color ?? COLORS[0])

  async function save() {
    if (!name.trim()) return
    await upsertCategory({
      id: category?.id,
      name: name.trim(),
      group,
      monthlyBudget: parseFloat(budget || '0'),
      icon,
      color,
    })
    onClose()
  }

  async function archive() {
    if (!category) return
    await db.categories.update(category.id, { archived: true, updatedAt: Date.now() })
    onClose()
  }

  return (
    <Sheet open onClose={onClose} title={category ? 'Edit category' : 'New category'}>
      <div className="space-y-4">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Category name"
          className="w-full bg-ink-800 border border-ink-700 rounded-xl px-3 py-2.5 text-ink-100 focus:outline-none focus:border-brand-500"
        />
        <div className="grid grid-cols-3 gap-2">
          {(['fixed', 'discretionary', 'other'] as const).map((g) => (
            <button
              key={g}
              onClick={() => setGroup(g)}
              className={`py-2 rounded-lg text-xs capitalize ${group === g ? 'bg-brand-500 text-ink-950' : 'bg-ink-800 text-ink-300'}`}
            >
              {g}
            </button>
          ))}
        </div>
        <div>
          <div className="text-xs text-ink-400 mb-1.5">Monthly budget (0 = none)</div>
          <AmountField
            value={budget === '' ? 0 : parseFloat(budget)}
            onChange={(n) => setBudget(String(n))}
            title="Monthly budget"
          />
        </div>
        <div>
          <div className="text-xs text-ink-400 mb-1.5">Icon</div>
          <div className="flex flex-wrap gap-1.5">
            {EMOJIS.map((e) => (
              <button
                key={e}
                onClick={() => setIcon(e)}
                className={`h-9 w-9 rounded-lg text-lg ${icon === e ? 'bg-brand-500/20 ring-1 ring-brand-500' : 'bg-ink-800'}`}
              >
                {e}
              </button>
            ))}
          </div>
        </div>
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
          {category && (
            <button onClick={archive} className="px-4 py-3 rounded-xl border border-ink-700 text-ink-400 text-sm">
              Archive
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

function WalletManager({ accounts }: { accounts: ReturnType<typeof useAccounts> }) {
  const [name, setName] = useState('')
  const [type, setType] = useState<WalletType>('ewallet')
  const [color, setColor] = useState(COLORS[2])

  async function add() {
    if (!name.trim()) return
    await upsertAccount({ name: name.trim(), type, color })
    setName('')
  }

  return (
    <div>
      <div className="space-y-2 mb-5">
        {(accounts ?? []).map((a) => (
          <div key={a.id} className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-ink-800 border border-ink-700">
            <span className="h-3 w-3 rounded-full" style={{ backgroundColor: a.color }} />
            <span className="flex-1 text-sm text-ink-100">{a.name}</span>
            <span className="text-xs text-ink-500">{walletTypeLabel(a.type)}</span>
          </div>
        ))}
      </div>
      <div className="space-y-3 border-t border-ink-800 pt-4">
        <div className="text-xs text-ink-400">Add a wallet</div>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Wallet name (e.g. Cash, GrabPay)"
          className="w-full bg-ink-800 border border-ink-700 rounded-xl px-3 py-2.5 text-ink-100 focus:outline-none focus:border-brand-500"
        />
        <div className="grid grid-cols-2 gap-2">
          {WALLET_TYPES.map((t) => (
            <button
              key={t.value}
              onClick={() => setType(t.value)}
              className={`py-2 rounded-lg text-sm ${type === t.value ? 'bg-brand-500 text-ink-950' : 'bg-ink-800 text-ink-300'}`}
            >
              {t.label}
            </button>
          ))}
        </div>
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
        <button onClick={add} className="w-full py-3 rounded-xl bg-brand-500 text-ink-950 font-semibold">
          Add wallet
        </button>
      </div>
    </div>
  )
}
