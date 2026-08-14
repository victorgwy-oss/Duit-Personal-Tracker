import { useState } from 'react'
import { sendMagicLink } from '../lib/supabase'

// Passwordless sign-in. Shown only in online mode when there's no session.
export default function Auth() {
  const [email, setEmail] = useState('')
  const [sent, setSent] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!email.trim()) return
    setBusy(true)
    setError('')
    try {
      await sendMagicLink(email.trim())
      setSent(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send the link.')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="min-h-full flex flex-col justify-center max-w-md mx-auto px-6 safe-top">
      <div className="mb-8">
        <div className="text-3xl font-bold text-ink-100">Duit</div>
        <p className="text-ink-400 mt-1">Sign in to sync across your devices.</p>
      </div>

      {sent ? (
        <div className="rounded-2xl bg-ink-800 border border-ink-700 p-6 text-center">
          <p className="text-4xl mb-3">📧</p>
          <p className="text-ink-100 font-medium">Check your email</p>
          <p className="text-sm text-ink-400 mt-1">
            We sent a sign-in link to <span className="text-ink-200">{email}</span>. Open it on this device to continue.
          </p>
          <button onClick={() => setSent(false)} className="mt-4 text-sm text-brand-400">
            Use a different email
          </button>
        </div>
      ) : (
        <form onSubmit={submit} className="space-y-3">
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@email.com"
            autoComplete="email"
            className="w-full bg-ink-800 border border-ink-700 rounded-xl px-4 py-3 text-ink-100 placeholder:text-ink-500 focus:outline-none focus:border-brand-500"
          />
          {error && <p className="text-sm text-bad">{error}</p>}
          <button
            type="submit"
            disabled={busy || !email.trim()}
            className="w-full py-3.5 rounded-xl bg-brand-500 text-ink-950 font-semibold disabled:opacity-40"
          >
            {busy ? 'Sending…' : 'Email me a sign-in link'}
          </button>
          <p className="text-xs text-ink-500 text-center">No password needed — we email you a secure link.</p>
        </form>
      )}
    </div>
  )
}
