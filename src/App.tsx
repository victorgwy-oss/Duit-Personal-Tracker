import { useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { useSettings } from './hooks/useData'
import { runAutoPost } from './lib/autopost'
import { isOnlineMode } from './lib/config'
import { getSession, onAuthChange } from './lib/supabase'
import { setUser, bootstrap, startAutoSync } from './lib/sync'
import Auth from './screens/Auth'
import { HomeIcon, ListIcon, RepeatIcon, GearIcon, PlusIcon, CameraIcon } from './components/icons'
import Dashboard from './screens/Dashboard'
import TransactionsScreen from './screens/Transactions'
import RecurringScreen from './screens/Recurring'
import SettingsScreen from './screens/Settings'
import QuickAdd from './screens/QuickAdd'
import ReceiptScanner from './screens/ReceiptScanner'
import Onboarding from './screens/Onboarding'

type Tab = 'home' | 'txns' | 'recurring' | 'settings'

export default function App() {
  const settings = useSettings()
  const [tab, setTab] = useState<Tab>('home')
  const [quickAdd, setQuickAdd] = useState(false)
  const [scanner, setScanner] = useState(false)

  // Auth state (online mode only).
  const [authReady, setAuthReady] = useState(!isOnlineMode)
  const [session, setSession] = useState<Session | null>(null)

  useEffect(() => {
    if (!isOnlineMode) return
    function apply(s: Session | null) {
      setSession(s)
      setUser(s?.user?.id ?? null)
      if (s) {
        bootstrap()
        startAutoSync()
      }
    }
    getSession().then((s) => {
      apply(s)
      setAuthReady(true)
    })
    return onAuthChange(apply)
  }, [])

  // Post any due recurring charges the moment the app opens (mirrors the
  // server-side cron). Runs after data is ready.
  useEffect(() => {
    if (settings?.onboarded) runAutoPost()
  }, [settings?.onboarded])

  if (isOnlineMode && !authReady) return <SplashScreen />
  if (isOnlineMode && !session) return <Auth />
  if (!settings) return <SplashScreen />
  if (!settings.onboarded) return <Onboarding />

  return (
    <div className="min-h-full flex flex-col max-w-md mx-auto relative">
      <main className="flex-1 pb-28">
        {tab === 'home' && <Dashboard onScan={() => setScanner(true)} />}
        {tab === 'txns' && <TransactionsScreen />}
        {tab === 'recurring' && <RecurringScreen />}
        {tab === 'settings' && <SettingsScreen />}
      </main>

      {/* Floating actions: scan receipt + quick add */}
      <div className="fixed bottom-24 left-1/2 -translate-x-1/2 w-full max-w-md flex justify-end pr-5 gap-3 z-30 pointer-events-none">
        <button
          onClick={() => setScanner(true)}
          className="pointer-events-auto h-12 w-12 rounded-full bg-ink-800 border border-ink-700 text-brand-400 shadow-lg flex items-center justify-center active:scale-95 transition"
          aria-label="Scan receipt"
        >
          <CameraIcon width={22} height={22} />
        </button>
        <button
          onClick={() => setQuickAdd(true)}
          className="pointer-events-auto h-14 w-14 rounded-full bg-brand-500 text-ink-950 shadow-xl shadow-brand-500/20 flex items-center justify-center active:scale-95 transition"
          aria-label="Add expense"
        >
          <PlusIcon width={26} height={26} />
        </button>
      </div>

      <BottomNav tab={tab} setTab={setTab} />

      <QuickAdd open={quickAdd} onClose={() => setQuickAdd(false)} />
      <ReceiptScanner open={scanner} onClose={() => setScanner(false)} />
    </div>
  )
}

function BottomNav({ tab, setTab }: { tab: Tab; setTab: (t: Tab) => void }) {
  const items: { id: Tab; label: string; Icon: typeof HomeIcon }[] = [
    { id: 'home', label: 'Home', Icon: HomeIcon },
    { id: 'txns', label: 'Activity', Icon: ListIcon },
    { id: 'recurring', label: 'Recurring', Icon: RepeatIcon },
    { id: 'settings', label: 'Settings', Icon: GearIcon },
  ]
  return (
    <nav className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-md bg-ink-900/95 backdrop-blur border-t border-ink-800 safe-bottom z-40">
      <div className="grid grid-cols-4">
        {items.map(({ id, label, Icon }) => {
          const active = tab === id
          return (
            <button
              key={id}
              onClick={() => setTab(id)}
              className={`flex flex-col items-center gap-1 py-3 text-xs transition ${
                active ? 'text-brand-400' : 'text-ink-500'
              }`}
            >
              <Icon width={22} height={22} />
              {label}
            </button>
          )
        })}
      </div>
    </nav>
  )
}

function SplashScreen() {
  return (
    <div className="min-h-full flex items-center justify-center text-ink-500">
      <div className="animate-pulse text-2xl font-semibold">Duit</div>
    </div>
  )
}
