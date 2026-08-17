import { createClient } from '@supabase/supabase-js'
import 'dotenv/config'

if (!process.env.SUPABASE_URL || !process.env.SUPABASE_SERVICE_KEY) {
  throw new Error('Stel SUPABASE_URL en SUPABASE_SERVICE_KEY in via .env')
}

export const db = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
)
