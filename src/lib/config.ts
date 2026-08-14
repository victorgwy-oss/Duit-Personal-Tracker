// Environment configuration. Blank Supabase values => local-only mode.
export const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string | undefined
export const SUPABASE_ANON_KEY = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined
export const isOnlineMode = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY)
