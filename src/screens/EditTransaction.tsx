import { useEffect, useState } from 'react'
import Sheet from '../components/Sheet'
import { useAccounts, useCategories } from '../hooks/useData'
import { deleteTransaction, updateTransaction } from '../lib/repo'
import { todayISO } from '../lib/format'
import { TrashIcon } from '../components/icons'
import type { Transaction } from '../lib/types'

export default function EditTransaction({ txn, onClose }: { txn: Transaction | null; onClose: () => void }) {
  const accounts = useAccounts()
  const categories = useCategories()
  const [amount, setAmount] = useState('')
  const [accountId, setAccountId] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [note, setNote] = useState('')
  const [date, setDate] = useState(todayISO())

  useEffect(() => {
    if (!txn) return
    setAmount(String(txn.amount))
    setAccountId(txn.accountId)
    setCategoryId(txn.categoryId)
    setNote(txn.note)
    setDate(txn.date)
  }, [txn])

  if (!txn) return null

  async function save() {
    if (!txn) return
    await updateTransaction(txn.id, {
      amount: parseFloat(amount || '0'),
      accountId,
      categoryId,
      note: note.trim(),
      date,
    })
    onClose()
  }

  async function remove() {
    if (!txn) return
    await deleteTransaction(txn.id)
    onClose()
  }

  return (
    <Sheet open={!!txn} onClose={onClose} title="Edit expense">
      <div className="flex flex-col gap-4">
        <Field label="Amount">
          <div className="flex items-center bg-ink-800 border border-ink-700 rounded-xl px-3 py-2.5">
            <span className="text-ink-500 mr-2">RM</span>
            <input
              type="number"
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              className="flex-1 bg-transparent text-lg font-semibold text-ink-100 focus:outline-none"
            />
          </div>
        </Field>

        <Field label="Wallet">
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
        </Field>

        <Field label="Category">
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
        </Field>

        <Field label="Note">
          <input
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className="w-full bg-ink-800 border border-ink-700 rounded-xl px-3 py-2.5 text-sm text-ink-100 focus:outline-none focus:border-brand-500"
          />
        </Field>

        <Field label="Date">
          <input
            type="date"
            value={date}
            max={todayISO()}
            onChange={(e) => setDate(e.target.value || todayISO())}
            className="w-full bg-ink-800 border border-ink-700 rounded-xl px-3 py-2.5 text-sm text-ink-100 focus:outline-none focus:border-brand-500"
          />
        </Field>

        <div className="flex gap-2 pt-2">
          <button
            onClick={remove}
            className="px-4 py-3 rounded-xl border border-bad/40 text-bad flex items-center gap-2"
          >
            <TrashIcon width={18} height={18} /> Delete
          </button>
          <button
            onClick={save}
            className="flex-1 py-3 rounded-xl bg-brand-500 text-ink-950 font-semibold"
          >
            Save changes
          </button>
        </div>
      </div>
    </Sheet>
  )
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-xs font-medium text-ink-400 mb-1.5">{label}</div>
      {children}
    </div>
  )
}
