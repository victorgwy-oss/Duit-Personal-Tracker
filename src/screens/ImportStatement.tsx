import { useMemo, useRef, useState } from 'react'
import Sheet from '../components/Sheet'
import { useAccounts, useCategories, useSettings } from '../hooks/useData'
import {
  detectDelimiter,
  parseDelimited,
  guessColumns,
  buildCandidates,
  commitImport,
  type ColumnMap,
  type ImportCandidate,
} from '../lib/import'
import { formatMoney, formatShortDate } from '../lib/format'
import { UploadIcon } from '../components/icons'

type Stage = 'paste' | 'map' | 'done'

export default function ImportStatement({ open, onClose }: { open: boolean; onClose: () => void }) {
  const accounts = useAccounts()
  const categories = useCategories()
  const settings = useSettings()
  const fileRef = useRef<HTMLInputElement>(null)

  const [stage, setStage] = useState<Stage>('paste')
  const [text, setText] = useState('')
  const [rows, setRows] = useState<string[][]>([])
  const [map, setMap] = useState<ColumnMap>({ date: 0, amount: 1, description: 2 })
  const [candidates, setCandidates] = useState<ImportCandidate[]>([])
  const [accountId, setAccountId] = useState('')
  const [categoryId, setCategoryId] = useState('')
  const [importedCount, setImportedCount] = useState(0)

  const currency = settings?.currency ?? 'RM'

  function reset() {
    setStage('paste')
    setText('')
    setRows([])
    setCandidates([])
    setImportedCount(0)
  }
  function close() {
    reset()
    onClose()
  }

  async function parse() {
    const delimiter = detectDelimiter(text)
    const parsed = parseDelimited(text, delimiter)
    if (parsed.length === 0) return
    const guessed = guessColumns(parsed)
    setRows(parsed)
    setMap(guessed)
    setCandidates(await buildCandidates(parsed, guessed))
    setAccountId(accounts?.find((a) => a.type === 'card')?.id ?? accounts?.[0]?.id ?? '')
    setCategoryId(categories?.find((c) => c.name === 'Other')?.id ?? categories?.[0]?.id ?? '')
    setStage('map')
  }

  async function remap(next: ColumnMap) {
    setMap(next)
    setCandidates(await buildCandidates(rows, next))
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    e.target.value = ''
    if (!file) return
    const content = await file.text()
    setText(content)
  }

  async function commit() {
    const n = await commitImport(candidates, accountId, categoryId)
    setImportedCount(n)
    setStage('done')
  }

  const width = useMemo(() => Math.max(0, ...rows.map((r) => r.length)), [rows])
  const includedCount = candidates.filter((c) => c.include).length
  const dupCount = candidates.filter((c) => c.duplicate).length

  return (
    <Sheet open={open} onClose={close} title="Import statement" full>
      {stage === 'paste' && (
        <div className="space-y-3">
          <p className="text-sm text-ink-400">
            Paste rows copied from your credit-card or TouchNGo statement, or upload a CSV. We’ll match up the columns
            and skip anything you’ve already logged.
          </p>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={'2026-08-03, 120.00, GRAB* RIDE\n2026-08-05, 59.90, SPOTIFY'}
            className="w-full h-48 bg-ink-800 border border-ink-700 rounded-xl px-3 py-2.5 text-sm text-ink-100 font-mono placeholder:text-ink-600 focus:outline-none focus:border-brand-500"
          />
          <div className="flex gap-2">
            <button
              onClick={() => fileRef.current?.click()}
              className="px-4 py-3 rounded-xl bg-ink-800 border border-ink-700 text-ink-200 text-sm flex items-center gap-2"
            >
              <UploadIcon width={18} height={18} /> Upload CSV
            </button>
            <button
              onClick={parse}
              disabled={!text.trim()}
              className="flex-1 py-3 rounded-xl bg-brand-500 text-ink-950 font-semibold disabled:opacity-40"
            >
              Next
            </button>
          </div>
          <input ref={fileRef} type="file" accept=".csv,text/csv,text/plain" className="hidden" onChange={onFile} />
        </div>
      )}

      {stage === 'map' && (
        <div className="space-y-4">
          {/* Column mapping */}
          <div className="grid grid-cols-3 gap-2">
            <ColSelect label="Date" width={width} value={map.date} onChange={(v) => remap({ ...map, date: v })} />
            <ColSelect label="Amount" width={width} value={map.amount} onChange={(v) => remap({ ...map, amount: v })} />
            <ColSelect label="Description" width={width} value={map.description} onChange={(v) => remap({ ...map, description: v })} />
          </div>

          {/* Wallet + category to file these under */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <div className="text-xs text-ink-400 mb-1.5">Import to wallet</div>
              <select value={accountId} onChange={(e) => setAccountId(e.target.value)} className="w-full bg-ink-800 border border-ink-700 rounded-xl px-3 py-2.5 text-sm text-ink-100">
                {(accounts ?? []).map((a) => <option key={a.id} value={a.id}>{a.name}</option>)}
              </select>
            </div>
            <div>
              <div className="text-xs text-ink-400 mb-1.5">Default category</div>
              <select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} className="w-full bg-ink-800 border border-ink-700 rounded-xl px-3 py-2.5 text-sm text-ink-100">
                {(categories ?? []).map((c) => <option key={c.id} value={c.id}>{c.icon} {c.name}</option>)}
              </select>
            </div>
          </div>

          <div className="text-xs text-ink-400">
            {candidates.length} rows · <span className="text-good">{includedCount} to import</span>
            {dupCount > 0 && <span className="text-warn"> · {dupCount} likely duplicates skipped</span>}
          </div>

          {/* Preview */}
          <div className="border border-ink-800 rounded-xl divide-y divide-ink-800 max-h-72 overflow-y-auto no-scrollbar">
            {candidates.map((c, i) => (
              <label key={i} className="flex items-center gap-3 px-3 py-2.5 text-sm">
                <input
                  type="checkbox"
                  checked={c.include}
                  onChange={(e) => {
                    const next = [...candidates]
                    next[i] = { ...c, include: e.target.checked }
                    setCandidates(next)
                  }}
                  className="accent-brand-500 h-4 w-4"
                />
                <span className="text-ink-500 w-12 shrink-0">{formatShortDate(c.date)}</span>
                <span className="flex-1 truncate text-ink-200">{c.description || '—'}</span>
                {c.duplicate && <span className="text-[10px] text-warn shrink-0">dup</span>}
                <span className="tabular-nums text-ink-100 shrink-0">{formatMoney(c.amount, currency)}</span>
              </label>
            ))}
          </div>

          <div className="flex gap-2">
            <button onClick={() => setStage('paste')} className="px-4 py-3 rounded-xl border border-ink-700 text-ink-300 text-sm">
              Back
            </button>
            <button
              onClick={commit}
              disabled={includedCount === 0}
              className="flex-1 py-3 rounded-xl bg-brand-500 text-ink-950 font-semibold disabled:opacity-40"
            >
              Import {includedCount} transactions
            </button>
          </div>
        </div>
      )}

      {stage === 'done' && (
        <div className="flex flex-col items-center gap-4 py-12 text-center">
          <p className="text-5xl">✅</p>
          <p className="text-ink-200">Imported {importedCount} transactions.</p>
          <button onClick={close} className="px-6 py-3 rounded-xl bg-brand-500 text-ink-950 font-semibold">
            Done
          </button>
        </div>
      )}
    </Sheet>
  )
}

function ColSelect({
  label,
  width,
  value,
  onChange,
}: {
  label: string
  width: number
  value: number
  onChange: (v: number) => void
}) {
  return (
    <div>
      <div className="text-xs text-ink-400 mb-1.5">{label}</div>
      <select
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full bg-ink-800 border border-ink-700 rounded-lg px-2 py-2 text-sm text-ink-100"
      >
        {Array.from({ length: width }, (_, i) => (
          <option key={i} value={i}>
            Col {i + 1}
          </option>
        ))}
      </select>
    </div>
  )
}
