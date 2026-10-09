import { createClient } from '@supabase/supabase-js'

// Publishable (anon) key aman ada di browser; data dilindungi Row Level Security.
// Nilai di Vercel (VITE_*) akan dipakai kalau diisi, kalau tidak pakai nilai bawaan ini.
const url = (import.meta.env.VITE_SUPABASE_URL as string | undefined) || 'https://izxggknnogvgdlgvelgj.supabase.co'
const key = (import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined) || 'sb_publishable_z3lgB99eG5RpZILYJkZCBQ_T3GVSyJs'

export const configured = Boolean(url && key)
export const supabase = createClient(url, key)
