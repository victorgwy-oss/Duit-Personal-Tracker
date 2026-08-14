import { createClient, type SupabaseClient, type Session } from '@supabase/supabase-js'
import { SUPABASE_URL, SUPABASE_ANON_KEY, isOnlineMode } from './config'

// A single Supabase client for the whole app. Null in local-only mode.
export const supabase: SupabaseClient | null = isOnlineMode
  ? createClient(SUPABASE_URL!, SUPABASE_ANON_KEY!, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    })
  : null

export async function getSession(): Promise<Session | null> {
  if (!supabase) return null
  const { data } = await supabase.auth.getSession()
  return data.session
}

export function onAuthChange(cb: (session: Session | null) => void): () => void {
  if (!supabase) return () => {}
  const { data } = supabase.auth.onAuthStateChange((_event, session) => cb(session))
  return () => data.subscription.unsubscribe()
}

// Passwordless magic-link sign-in. The user clicks the link in their email and
// is returned to the app already authenticated.
export async function sendMagicLink(email: string): Promise<void> {
  if (!supabase) throw new Error('Online mode is off.')
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: { emailRedirectTo: window.location.origin },
  })
  if (error) throw error
}

export async function signOut(): Promise<void> {
  if (!supabase) return
  await supabase.auth.signOut()
}
