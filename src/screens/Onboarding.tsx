import { useState } from 'react'
import { saveSettings } from '../lib/repo'
import { formatMoney } from '../lib/format'
import AmountField from '../components/AmountField'

// One-time setup so the dashboard can compute projected savings from day one.
export default function Onboarding() {
  const [step, setStep] = useState(0)
  const [income, setIncome] = useState('')
  const [target, setTarget] = useState('3000')
  const [cycleStartDay, setCycleStartDay] = useState('1')

  async function finish() {
    await saveSettings({
      monthlyIncome: parseFloat(income || '0'),
      savingsTarget: parseFloat(target || '0'),
      cycleStartDay: parseInt(cycleStartDay || '1', 10),
      onboarded: true,
    })
  }

  return (
    <div className="min-h-full flex flex-col max-w-md mx-auto px-6 py-10 safe-top">
      <div className="mb-8">
        <div className="text-3xl font-bold text-ink-100">Duit</div>
        <p className="text-ink-400 mt-1">
          One glance at everything you spend — TouchNGo and card together.
        </p>
      </div>

      {step === 0 && (
        <Panel
          title="What's your monthly take-home income?"
          hint="Used to project how much you'll actually save this month. You can change it later."
        >
          <AmountField
            value={income === '' ? 0 : parseFloat(income)}
            onChange={(n) => setIncome(String(n))}
            title="Monthly income"
            big
          />
          <NextButton onClick={() => setStep(1)} label="Continue" />
        </Panel>
      )}

      {step === 1 && (
        <Panel
          title="How much do you want to save each month?"
          hint="We'll warn you before your spending eats into this."
        >
          <div className="grid grid-cols-2 gap-2 mb-3">
            {['3000', '5000'].map((v) => (
              <button
                key={v}
                onClick={() => setTarget(v)}
                className={`py-3 rounded-xl border font-medium ${
                  target === v ? 'border-brand-500 bg-brand-500/15 text-brand-400' : 'border-ink-700 text-ink-300'
                }`}
              >
                {formatMoney(Number(v))}
              </button>
            ))}
          </div>
          <AmountField
            value={target === '' ? 0 : parseFloat(target)}
            onChange={(n) => setTarget(String(n))}
            title="Savings target"
            big
          />
          <div className="flex gap-2 mt-2">
            <BackButton onClick={() => setStep(0)} />
            <NextButton onClick={() => setStep(2)} label="Continue" />
          </div>
        </Panel>
      )}

      {step === 2 && (
        <Panel
          title="When does your spending month start?"
          hint="Keep it at 1 for a calendar month, or match your credit-card statement day so totals line up with the bill you pay."
        >
          <div className="flex items-center gap-3 mb-2">
            <select
              value={cycleStartDay}
              onChange={(e) => setCycleStartDay(e.target.value)}
              className="bg-ink-800 border border-ink-700 rounded-xl px-4 py-3 text-ink-100 text-lg"
            >
              {Array.from({ length: 28 }, (_, i) => i + 1).map((d) => (
                <option key={d} value={d}>
                  Day {d}
                </option>
              ))}
            </select>
            <span className="text-ink-400 text-sm">
              {cycleStartDay === '1' ? 'Calendar month' : 'Statement-aligned'}
            </span>
          </div>
          <div className="flex gap-2 mt-4">
            <BackButton onClick={() => setStep(1)} />
            <NextButton onClick={finish} label="Start tracking" />
          </div>
        </Panel>
      )}

      <div className="mt-auto flex justify-center gap-1.5 pt-8">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className={`h-1.5 rounded-full transition-all ${i === step ? 'w-6 bg-brand-500' : 'w-1.5 bg-ink-700'}`}
          />
        ))}
      </div>
    </div>
  )
}

function Panel({ title, hint, children }: { title: string; hint: string; children: React.ReactNode }) {
  return (
    <div>
      <h1 className="text-xl font-semibold text-ink-100 mb-1">{title}</h1>
      <p className="text-sm text-ink-400 mb-5">{hint}</p>
      {children}
    </div>
  )
}

function NextButton({ onClick, label }: { onClick: () => void; label: string }) {
  return (
    <button
      onClick={onClick}
      className="flex-1 mt-4 py-3.5 rounded-xl bg-brand-500 text-ink-950 font-semibold active:scale-[0.99] transition"
    >
      {label}
    </button>
  )
}

function BackButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="mt-4 px-5 py-3.5 rounded-xl border border-ink-700 text-ink-300 font-medium"
    >
      Back
    </button>
  )
}
