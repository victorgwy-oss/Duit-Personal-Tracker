import { useEffect, useState } from 'react'
import Sheet from './Sheet'
import AmountField from './AmountField'
import { useSettings, useWellbeing } from '../hooks/useData'
import { ensureForMeCategory, saveWellbeing } from '../lib/repo'

// Gentler-money settings: a "Just for me" fund (money already approved for you,
// every month) and a past money emergency to measure today against.
export default function WellbeingSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const settings = useSettings()
  const wellbeing = useWellbeing()
  const currency = settings?.currency ?? 'RM'
  const [forMe, setForMe] = useState(0)
  const [label, setLabel] = useState('')
  const [cost, setCost] = useState(0)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!open || !wellbeing) return
    setForMe(wellbeing.forMeMonthly)
    setLabel(wellbeing.emergencyLabel)
    setCost(wellbeing.emergencyAmount)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, wellbeing?.updatedAt])

  async function save() {
    setSaving(true)
    try {
      const forMeCategoryId = forMe > 0 ? await ensureForMeCategory() : wellbeing?.forMeCategoryId
      await saveWellbeing({
        forMeMonthly: Math.max(forMe, 0),
        forMeCategoryId,
        emergencyLabel: label.trim(),
        emergencyAmount: Math.max(cost, 0),
      })
      onClose()
    } finally {
      setSaving(false)
    }
  }

  return (
    <Sheet open={open} onClose={onClose} title="Just for me & reassurance" full>
      <div className="space-y-6">
        <section>
          <h3 className="text-sm font-semibold text-ink-100 mb-1">Just for me 💛</h3>
          <p className="text-xs text-ink-400 mb-3">
            Money that's already approved for you, every month, no justifying needed. Log anything for yourself
            under the <span className="text-ink-200">Just for me</span> category and it comes out of this fund.
            It's never shown as overspending.
          </p>
          <div className="text-xs text-ink-400 mb-1.5">Each month (0 = off)</div>
          <AmountField value={forMe} onChange={setForMe} currency={currency} title="Just for me, each month" big />
        </section>

        <section>
          <h3 className="text-sm font-semibold text-ink-100 mb-1">Your hardest money moment</h3>
          <p className="text-xs text-ink-400 mb-3">
            When money feels scary, it can help to see how today compares with a time it really was. Name a past
            money emergency and roughly what it cost. Only you can see this.
          </p>
          <input
            value={label}
            onChange={(e) => setLabel(e.target.value)}
            placeholder="e.g. Gearbox repair"
            className="w-full bg-ink-800 border border-ink-700 rounded-xl px-3 py-2.5 text-ink-100 placeholder:text-ink-500 focus:outline-none focus:border-brand-500 mb-2"
          />
          <AmountField value={cost} onChange={setCost} currency={currency} title="What it cost" />
        </section>

        <button
          onClick={save}
          disabled={saving}
          className="w-full py-3 rounded-xl bg-brand-500 text-ink-950 font-semibold disabled:opacity-40"
        >
          {saving ? 'Saving…' : 'Save'}
        </button>
      </div>
    </Sheet>
  )
}
