import { useMemo, useRef, useState } from 'react'
import Sheet from '../components/Sheet'
import { useAccounts, useCategories, useSettings } from '../hooks/useData'
import {
  detectDelimiter,
  parseDelimited,
  guessColumns,
  buildCandidates,
  commitImport,
  detectHeaderColumns,
  buildTrackerCandidates,
  distinctValues,
  suggestMatch,
  commitTracker,
  CREATE_NEW,
  type ColumnMap,
  type ImportCandidate,
  type TrackerCandidate,
} from '../lib/import'
import { formatMoney, formatShortDate } from '../lib/format'
import { UploadIcon } from '../components/icons'

type Stage = 'paste' | 'map' | 'done'
type Mode = 'simple' | 'tracker'

export default function ImportStatement({ open, onClose }: { open: boolean; onClose: () => void }) {
  const accounts = useAccounts()
  const categories = useCategories()
  const settings = useSettings()
  const fileRef = useRef<HTMLInputElement>(null)
  const currency = settings?.currency ?? 'RM'

  const [stage, setStage] = useState<Stage>('paste')
  const [mode, setMode] = useState<Mode>('simple')
  const [text, setText] = useState('')
  const [doneMsg, setDoneMsg] = useState('')

  // simple mode
  const [rows, setRows] = useState<string[][]>([])
  const [map, setMap] = useState<ColumnMap>({ date: 0, amount: 1, description: 2 })
  const [candidates, setCandidates] = useState<ImportCandidate[]>([])
  const [accountId, setAccountId] = useState('')
  const [categoryId, setCategoryId] = useState('')

  // tracker mode
  const [tCands, setTCands] = useState<TrackerCandidate[]>([])
  const [catChoice, setCatChoice] = useState<Record<string, string>>({})
  const [accChoice, setAccChoice] = useState<Record<string, string>>({})
  const [skipIncome, setSkipIncome] = useState(true)
  const [fallbackCat, setFallbackCat] = useState('')
  const [fallbackAcc, setFallbackAcc] = useState('')

  function reset() {
    setStage('paste'); setMode('simple'); setText(''); setRows([]); setCandidates([]); setTCands([]); setDoneMsg('')
  }
  function close() { reset(); onClose() }

  async function parse() {
    const delimiter = detectDelimiter(text)
    const parsed = parseDelimited(text, delimiter)
    if (parsed.length === 0) return

    const header = detectHeaderColumns(parsed[0])
    const isTracker = !!header && (header.category != null || header.account != null || header.type != null)

    if (isTracker && header) {
      const cands = await buildTrackerCandidates(parsed, header, true)
      const catNames = distinctValues(cands, 'categoryName')
      const accNames = distinctValues(cands, 'accountName')
      const catOpts = (categories ?? []).map((c) => ({ id: c.id, name: c.name }))
      const accOpts = (accounts ?? []).map((a) => ({ id: a.id, name: a.name }))
      setCatChoice(Object.fromEntries(catNames.map((n) => [n, suggestMatch(n, catOpts) ?? CREATE_NEW])))
      setAccChoice(Object.fromEntries(accNames.map((n) => [n, suggestMatch(n, accOpts) ?? CREATE_NEW])))
      setFallbackCat((categories ?? []).find((c) => c.name === 'Other')?.id ?? categories?.[0]?.id ?? '')
      setFallbackAcc(accounts?.[0]?.id ?? '')
      setTCands(cands)
      setMode('tracker')
      setStage('map')
      return
    }

    // Simple bank-statement flow
    const guessed = guessColumns(parsed)
    setRows(parsed)
    setMap(guessed)
    setCandidates(await buildCandidates(parsed, guessed))
    setAccountId(accounts?.find((a) => a.type === 'card')?.id ?? accounts?.[0]?.id ?? '')
    setCategoryId((categories ?? []).find((c) => c.name === 'Other')?.id ?? categories?.[0]?.id ?? '')
    setMode('simple')
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
    setText(await file.text())
  }

  async function commitSimple() {
    const n = await commitImport(candidates, accountId, categoryId)
    setDoneMsg(`Imported ${n} transactions.`)
    setStage('done')
  }

  async function commitTrackerFlow() {
    const res = await commitTracker({
      candidates: tCands,
      categoryChoice: catChoice,
      accountChoice: accChoice,
      fallbackCategoryId: fallbackCat,
      fallbackAccountId: fallbackAcc,
      skipIncome,
    })
    const bits = [`Imported ${res.imported}`]
    if (res.skippedIncome) bits.push(`${res.skippedIncome} income skipped`)
    if (res.skippedDup) bits.push(`${res.skippedDup} duplicates skipped`)
    setDoneMsg(bits.join(' · ') + '.')
    setStage('done')
  }

  const width = useMemo(() => Math.max(0, ...rows.map((r) => r.length)), [rows])

  // Tracker summary counts
  const incomeCount = tCands.filter((c) => c.isIncome).length
  const dupCount = tCands.filter((c) => c.duplicate).length
  const importCount = tCands.filter((c) => c.include && !(c.isIncome && skipIncome)).length

  return (
    <Sheet open={open} onClose={close} title="Import" full>
      {stage === 'paste' && (
        <div className="space-y-3">
          <p className="text-sm text-ink-400">
            Paste rows from a statement or another money-tracker export, or upload a CSV. If it has category and
            account columns, I’ll map them over and auto-create anything new.
          </p>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={'"TIME","TYPE","AMOUNT","CATEGORY","ACCOUNT","NOTES"\n"Aug 01, 2026","(-) Expense","10.50","Food","Cash","Chicken rice"'}
            className="w-full h-44 bg-ink-800 border border-ink-700 rounded-xl px-3 py-2.5 text-xs text-ink-100 font-mono placeholder:text-ink-600 focus:outline-none focus:border-brand-500"
          />
          <div className="flex gap-2">
            <button onClick={() => fileRef.current?.click()} className="px-4 py-3 rounded-xl bg-ink-800 border border-ink-700 text-ink-200 text-sm flex items-center gap-2">
              <UploadIcon width={18} height={18} /> Upload CSV
            </button>
            <button onClick={parse} disabled={!text.trim()} className="flex-1 py-3 rounded-xl bg-brand-500 text-ink-950 font-semibold disabled:opacity-40">
              Next
            </button>
          </div>
          <input ref={fileRef} type="file" accept=".csv,text/csv,text/plain" className="hidden" onChange={onFile} />
        </div>
      )}

      {stage === 'map' && mode === 'tracker' && (
        <div className="space-y-5">
          <div className="rounded-xl bg-ink-800/60 border border-ink-700 p-3 text-sm">
            <div className="text-ink-100 font-medium">{importCount} transactions ready to import</div>
            <div className="text-xs text-ink-400 mt-0.5">
              {incomeCount > 0 && <>{incomeCount} income rows{skipIncome ? ' skipped' : ' included'} · </>}
              {dupCount > 0 && <>{dupCount} duplicates skipped · </>}
              original dates kept
            </div>
          </div>

          <label className="flex items-center gap-3 text-sm text-ink-200">
            <input type="checkbox" checked={skipIncome} onChange={(e) => setSkipIncome(e.target.checked)} className="accent-brand-500 h-4 w-4" />
            Skip income rows (income is tracked in Settings, not as spending)
          </label>

          {/* Category mapping */}
          <div>
            <h4 className="text-xs font-semibold text-ink-400 uppercase tracking-wide mb-2">Map categories</h4>
            <div className="space-y-2">
              {Object.keys(catChoice).map((name) => (
                <MapRow
                  key={name}
                  label={name}
                  count={tCands.filter((c) => c.categoryName === name).length}
                  value={catChoice[name]}
                  onChange={(v) => setCatChoice({ ...catChoice, [name]: v })}
                  options={(categories ?? []).map((c) => ({ id: c.id, label: `${c.icon} ${c.name}` }))}
                  newLabel={`➕ Create “${name}”`}
                />
              ))}
            </div>
          </div>

          {/* Account mapping */}
          <div>
            <h4 className="text-xs font-semibold text-ink-400 uppercase tracking-wide mb-2">Map wallets</h4>
            <div className="space-y-2">
              {Object.keys(accChoice).map((name) => (
                <MapRow
                  key={name}
                  label={name}
                  count={tCands.filter((c) => c.accountName === name).length}
                  value={accChoice[name]}
                  onChange={(v) => setAccChoice({ ...accChoice, [name]: v })}
                  options={(accounts ?? []).map((a) => ({ id: a.id, label: a.name }))}
                  newLabel={`➕ Create “${name}” wallet`}
                />
              ))}
            </div>
          </div>

          {/* Preview */}
          <div>
            <h4 className="text-xs font-semibold text-ink-400 uppercase tracking-wide mb-2">Preview</h4>
            <div className="border border-ink-800 rounded-xl divide-y divide-ink-800 max-h-64 overflow-y-auto no-scrollbar">
              {tCands.slice(0, 300).map((c, i) => {
                const skipped = c.duplicate || (c.isIncome && skipIncome)
                return (
                  <div key={i} className={`flex items-center gap-2 px-3 py-2 text-sm ${skipped ? 'opacity-40' : ''}`}>
                    <span className="text-ink-500 w-12 shrink-0 text-xs">{formatShortDate(c.date)}</span>
                    <span className="flex-1 truncate text-ink-200">{c.note || c.categoryName || '—'}</span>
                    {c.isIncome && <span className="text-[10px] text-good shrink-0">income</span>}
                    {c.duplicate && <span className="text-[10px] text-warn shrink-0">dup</span>}
                    <span className="tabular-nums text-ink-100 shrink-0">{formatMoney(c.amount, currency)}</span>
                  </div>
                )
              })}
              {tCands.length > 300 && <div className="px-3 py-2 text-xs text-ink-500">+ {tCands.length - 300} more…</div>}
            </div>
          </div>

          <div className="flex gap-2">
            <button onClick={() => setStage('paste')} className="px-4 py-3 rounded-xl border border-ink-700 text-ink-300 text-sm">Back</button>
            <button onClick={commitTrackerFlow} disabled={importCount === 0} className="flex-1 py-3 rounded-xl bg-brand-500 text-ink-950 font-semibold disabled:opacity-40">
              Import {importCount} transactions
            </button>
          </div>
        </div>
      )}

      {stage === 'map' && mode === 'simple' && (
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-2">
            <ColSelect label="Date" width={width} value={map.date} onChange={(v) => remap({ ...map, date: v })} />
            <ColSelect label="Amount" width={width} value={map.amount} onChange={(v) => remap({ ...map, amount: v })} />
            <ColSelect label="Description" width={width} value={map.description} onChange={(v) => remap({ ...map, description: v })} />
          </div>
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
            {candidates.length} rows · <span className="text-good">{candidates.filter((c) => c.include).length} to import</span>
          </div>
          <div className="border border-ink-800 rounded-xl divide-y divide-ink-800 max-h-64 overflow-y-auto no-scrollbar">
            {candidates.map((c, i) => (
              <label key={i} className="flex items-center gap-3 px-3 py-2.5 text-sm">
                <input type="checkbox" checked={c.include} onChange={(e) => { const n = [...candidates]; n[i] = { ...c, include: e.target.checked }; setCandidates(n) }} className="accent-brand-500 h-4 w-4" />
                <span className="text-ink-500 w-12 shrink-0">{formatShortDate(c.date)}</span>
                <span className="flex-1 truncate text-ink-200">{c.description || '—'}</span>
                {c.duplicate && <span className="text-[10px] text-warn shrink-0">dup</span>}
                <span className="tabular-nums text-ink-100 shrink-0">{formatMoney(c.amount, currency)}</span>
              </label>
            ))}
          </div>
          <div className="flex gap-2">
            <button onClick={() => setStage('paste')} className="px-4 py-3 rounded-xl border border-ink-700 text-ink-300 text-sm">Back</button>
            <button onClick={commitSimple} disabled={candidates.filter((c) => c.include).length === 0} className="flex-1 py-3 rounded-xl bg-brand-500 text-ink-950 font-semibold disabled:opacity-40">
              Import
            </button>
          </div>
        </div>
      )}

      {stage === 'done' && (
        <div className="flex flex-col items-center gap-4 py-12 text-center">
          <p className="text-5xl">✅</p>
          <p className="text-ink-200">{doneMsg}</p>
          <button onClick={close} className="px-6 py-3 rounded-xl bg-brand-500 text-ink-950 font-semibold">Done</button>
        </div>
      )}
    </Sheet>
  )
}

function MapRow({
  label,
  count,
  value,
  onChange,
  options,
  newLabel,
}: {
  label: string
  count: number
  value: string
  onChange: (v: string) => void
  options: { id: string; label: string }[]
  newLabel: string
}) {
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 min-w-0">
        <div className="text-sm text-ink-100 truncate">{label}</div>
        <div className="text-[11px] text-ink-500">{count} rows</div>
      </div>
      <span className="text-ink-600">→</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-44 bg-ink-800 border border-ink-700 rounded-lg px-2 py-2 text-sm text-ink-100"
      >
        {options.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
        <option value={CREATE_NEW}>{newLabel}</option>
      </select>
    </div>
  )
}

function ColSelect({ label, width, value, onChange }: { label: string; width: number; value: number; onChange: (v: number) => void }) {
  return (
    <div>
      <div className="text-xs text-ink-400 mb-1.5">{label}</div>
      <select value={value} onChange={(e) => onChange(Number(e.target.value))} className="w-full bg-ink-800 border border-ink-700 rounded-lg px-2 py-2 text-sm text-ink-100">
        {Array.from({ length: width }, (_, i) => <option key={i} value={i}>Col {i + 1}</option>)}
      </select>
    </div>
  )
}
