#!/usr/bin/env node
/**
 * Runs the profiles SQL migration against your Supabase project.
 *
 * Usage:
 *   SUPABASE_PROJECT_REF=your_ref SUPABASE_TOKEN=your_token node supabase/migrate.js
 *
 * Where to find these:
 *   - Project ref: Settings → General → Reference ID  (e.g. abcdefghijklmnop)
 *   - Access token: https://supabase.com/dashboard/account/tokens → New token
 */

import { readFileSync } from 'fs'
import { fileURLToPath } from 'url'
import { dirname, join } from 'path'

const ref   = process.env.SUPABASE_PROJECT_REF
const token = process.env.SUPABASE_TOKEN

if (!ref || !token) {
  console.error('Missing required env vars. Run as:')
  console.error('  SUPABASE_PROJECT_REF=xxx SUPABASE_TOKEN=yyy node supabase/migrate.js')
  process.exit(1)
}

const __dir = dirname(fileURLToPath(import.meta.url))
const sql   = readFileSync(join(__dir, '001_profiles.sql'), 'utf8')

console.log('Running migration on project:', ref)

const res = await fetch(`https://api.supabase.com/v1/projects/${ref}/database/query`, {
  method:  'POST',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type':  'application/json',
  },
  body: JSON.stringify({ query: sql }),
})

const body = await res.json().catch(() => res.text())

if (!res.ok) {
  console.error('Migration failed:', res.status, body)
  process.exit(1)
}

console.log('Migration successful.')
console.log('')
console.log('Next: make yourself owner by running this in Supabase SQL Editor:')
console.log("  update public.profiles set role = 'owner', status = 'active' where email = 'your@email.com';")
