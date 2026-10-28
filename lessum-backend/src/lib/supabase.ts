import { createClient } from '@supabase/supabase-js'

import { env } from '../config/env.js'

const options = { auth: { persistSession: false, autoRefreshToken: false } }

export const supabaseAdmin = createClient(
  env.supabaseUrl,
  env.supabaseServiceRoleKey,
  options,
)

export const supabaseAnon = createClient(
  env.supabaseUrl,
  env.supabaseAnonKey,
  options,
)
