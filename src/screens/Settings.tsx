import { useEffect, useRef, useState } from 'react'
import { useSettings } from '../hooks/useData'
import { saveSettings } from '../lib/repo'
import { exportBackup, importBackup } from '../lib/backup'
import { isOnlineMode, syncNow } from '../lib/sync'
import { signOut } from '../lib/supabase'
import { UploadIcon, DownloadIcon } from '../components/icons'
import ManageLists from './ManageLists'
import ImportStatement from './ImportStatement'

export default function SettingsScreen() {
  const settings = useSettings()
  const [income, setIncome] = useState('')
  const [target, setTarget] = useState('')
  const [cycleStartDay, setCycleStartDay] = useState('1')
  const [savedFlash, setSavedFlash] = useState(false)
  const [manage, setManage] = useState(false)
  const [importOpen, setImportOpen] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const [importMsg, setImportMsg] = useState('')

  useEffect(() => {
    if (!settings) return
    setIncome(String(settings.monthlyIncome))
    setTarget(String(settings.savingsTarget))
    setCycleStartDay(String(settings.cycleStartDay))
  }, [settings])

  if (!settings) return null

  async function persist(patch: Parameters<typeof saveSettings>[0]) {
    await saveSettings(patch)
    setSavedFlash(true)
    setTimeout(() => setSavedFlash(false), 1200)
  }

  async function onImportFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    try {
      const res = await importBackup(file)
      setImportMsg(`Restored ${res.transactions} transactions.`)
    } catch (err) {
      setImportMsg(err instanceof Error ? err.message : 'Import failed.')
    }
    if (fileRef.current) fileRef.current.value = ''
    setTimeout(() => setImportMsg(''), 4000)
  }

  return (
    <div className="px-5 pt-6 safe-top pb-8">
      <div className="flex items-center justify-between mb-5">
        <h1 className="text-2xl font-bold text-ink-100">Settings</h1>
        {savedFlash && <span className="text-xs text-good">Saved ✓</span>}
      </div>

      <Section title="Money">
        <Row label="Monthly income">
          <MoneyInput value={income} onChange={setIncome} onBlur={() => persist({ monthlyIncome: parseFloat(income || '0') })} />
        </Row>
        <Row label="Savings target">
          <MoneyInput value={target} onChange={setTarget} onBlur={() => persist({ savingsTarget: parseFloat(target || '0') })} />
        </Row>
        <Row label="Cycle starts on">
          <select
            value={cycleStartDay}
            onChange={(e) => {
              setCycleStartDay(e.target.value)
              persist({ cycleStartDay: parseInt(e.target.value, 10) })
            }}
            className="bg-ink-800 border border-ink-700 rounded-lg px-3 py-2 text-ink-100 text-sm"
          >
            {Array.from({ length: 28 }, (_, i) => i + 1).map((d) => (
              <option key={d} value={d}>
                Day {d} {d === 1 ? '(calendar month)' : ''}
              </option>
            ))}
          </select>
        </Row>
      </Section>

      <Section title="Categories & wallets">
        <button
          onClick={() => setManage(true)}
          className="w-full text-left px-4 py-3 rounded-xl bg-ink-800 border border-ink-700 text-ink-200 text-sm"
        >
          Manage categories, budgets & wallets →
        </button>
      </Section>

      <Section title="Import">
        <button
          onClick={() => setImportOpen(true)}
          className="w-full text-left px-4 py-3 rounded-xl bg-ink-800 border border-ink-700 text-ink-200 text-sm"
        >
          Import a card / TouchNGo statement →
        </button>
      </Section>

      <Section title="Data & backup">
        <div className="flex gap-2">
          <button
            onClick={exportBackup}
            className="flex-1 py-3 rounded-xl bg-ink-800 border border-ink-700 text-ink-200 text-sm flex items-center justify-center gap-2"
          >
            <DownloadIcon width={18} height={18} /> Export
          </button>
          <button
            onClick={() => fileRef.current?.click()}
            className="flex-1 py-3 rounded-xl bg-ink-800 border border-ink-700 text-ink-200 text-sm flex items-center justify-center gap-2"
          >
            <UploadIcon width={18} height={18} /> Restore
          </button>
          <input ref={fileRef} type="file" accept="application/json" className="hidden" onChange={onImportFile} />
        </div>
        {importMsg && <p className="text-xs text-brand-400 mt-2">{importMsg}</p>}
        <p className="text-xs text-ink-500 mt-2">
          Your data lives on this device. Export a backup regularly, or restore it on another device.
        </p>
      </Section>

      <Section title="Sync">
        <div className="px-4 py-3 rounded-xl bg-ink-800 border border-ink-700 text-sm">
          <span className={isOnlineMode ? 'text-good' : 'text-ink-400'}>
            {isOnlineMode ? '● Online sync active' : '○ Local-only mode'}
          </span>
          <p className="text-xs text-ink-500 mt-1">
            {isOnlineMode
              ? 'Changes sync to your Supabase account across devices.'
              : 'Add your Supabase keys to sync across devices and access online.'}
          </p>
        </div>
        {isOnlineMode && (
          <div className="flex gap-2">
            <button onClick={() => syncNow()} className="flex-1 py-2.5 rounded-xl bg-ink-800 border border-ink-700 text-ink-200 text-sm">
              Sync now
            </button>
            <button onClick={() => signOut()} className="flex-1 py-2.5 rounded-xl bg-ink-800 border border-ink-700 text-ink-400 text-sm">
              Sign out
            </button>
          </div>
        )}
      </Section>

      <ManageLists open={manage} onClose={() => setManage(false)} />
      <ImportStatement open={importOpen} onClose={() => setImportOpen(false)} />
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-6">
      <h3 className="text-xs font-semibold text-ink-400 uppercase tracking-wide mb-2">{title}</h3>
      <div className="space-y-2">{children}</div>
    </section>
  )
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3 px-4 py-3 rounded-xl bg-ink-800 border border-ink-700">
      <span className="text-sm text-ink-300">{label}</span>
      {children}
    </div>
  )
}

function MoneyInput({ value, onChange, onBlur }: { value: string; onChange: (v: string) => void; onBlur: () => void }) {
  return (
    <div className="flex items-center gap-1">
      <span className="text-ink-500 text-sm">RM</span>
      <input
        type="number"
        inputMode="decimal"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        onBlur={onBlur}
        className="w-24 bg-ink-900 border border-ink-700 rounded-lg px-2 py-1.5 text-right text-ink-100 text-sm focus:outline-none focus:border-brand-500"
      />
    </div>
  )
}
