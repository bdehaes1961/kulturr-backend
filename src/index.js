import 'dotenv/config'
import Fastify from 'fastify'
import cors    from '@fastify/cors'
import cron    from 'node-cron'
import { db }  from './db.js'
import { runAggregation, notifyUsers } from './aggregator.js'
import { checkWatchlist }              from './watchlist.js'
import { affiliateUrl }                from './affiliate.js'

const app = Fastify({ logger: true })

// ─── CORS ────────────────────────────────────────────────────────────────────
await app.register(cors, {
  origin: (origin, cb) => {
    // Allow: no-origin (curl, server-to-server), configured allowlist, and any *.vercel.app preview
    if (!origin) return cb(null, true)
    const allowlist = [
      'https://kulturr-frontend.vercel.app',
      'https://kulturr.be',
      'https://www.kulturr.be',
      'http://localhost:3000',
    ]
    if (allowlist.includes(origin)) return cb(null, true)
    if (/^https:\/\/kulturr-frontend-[a-z0-9-]+\.vercel\.app$/.test(origin)) return cb(null, true)
    return cb(new Error('Not allowed by CORS'), false)
  },
  methods: ['GET', 'POST', 'DELETE', 'OPTIONS'],
})

// ─── Helpers ─────────────────────────────────────────────────────────────────

// Zet ticket_url om naar affiliate link waar van toepassing
function transformEvent(event) {
  if (!event) return event
  return { ...event, ticket_url: affiliateUrl(event.ticket_url, event.source) }
}

// ─── Routes ──────────────────────────────────────────────────────────────────

// GET /events — feed voor de app
// Queryparams: city, category, limit (default 20), offset (default 0)
app.get('/events', async (req) => {
  const { city, category, limit = 20, offset = 0 } = req.query
  const lim = Number(limit)
  const off = Number(offset)

  // Fetch a larger window so grouping still yields ~limit distinct series.
  // Conservative multiplier: some series have 30+ occurrences.
  const FETCH_MULT = 8
  const FETCH_CAP = 500

  let query = db
    .from('events')
    .select('id, source, title, venue_name, city, date_start, date_end, price_min, price_max, category, image_url, ticket_url, artists')
    .gte('date_start', new Date().toISOString())
    .order('date_start', { ascending: true })
    .range(0, Math.min((off + lim) * FETCH_MULT, FETCH_CAP) - 1)

  if (city)     query = query.eq('city', city)
  if (category) query = query.eq('category', category)

  const { data, error } = await query
  if (error) throw error

  // Group by (lower(title), lower(venue_name or city)).
  // Keep the earliest-date row as representative; collect all occurrences.
  const groups = new Map()
  for (const row of data ?? []) {
    const key = [
      (row.title || '').toLowerCase().trim(),
      (row.venue_name || row.city || '').toLowerCase().trim(),
    ].join('|')
    let g = groups.get(key)
    if (!g) {
      g = { rep: row, occurrences: [] }
      groups.set(key, g)
    }
    g.occurrences.push({
      id: row.id,
      date_start: row.date_start,
      date_end: row.date_end,
      ticket_url: row.ticket_url,
    })
  }

  const grouped = Array.from(groups.values()).map(({ rep, occurrences }) => {
    // Sort occurrences chronologically for stable ranges.
    occurrences.sort((a, b) => (a.date_start || '').localeCompare(b.date_start || ''))
    const first = occurrences[0]
    const last = occurrences[occurrences.length - 1]
    return {
      ...transformEvent(rep),
      // Overwrite date_start/date_end with the series range so the card can render it directly.
      date_start: first.date_start,
      date_end: occurrences.length > 1 ? (last.date_end || last.date_start) : rep.date_end,
      occurrence_count: occurrences.length,
      occurrences: occurrences.map(o => ({ ...o, ticket_url: affiliateUrl(o.ticket_url, rep.source) })),
    }
  })

  // Sort by earliest date_start then paginate at the group level.
  grouped.sort((a, b) => (a.date_start || '').localeCompare(b.date_start || ''))
  return grouped.slice(off, off + lim)
})

// GET /events/:id — detail (with sibling occurrences)
app.get('/events/:id', async (req) => {
  const { data, error } = await db
    .from('events')
    .select('*')
    .eq('id', req.params.id)
    .single()
  if (error) throw error

  // Find sibling occurrences: same title + same venue_name (or same city if venue null).
  const title = (data.title || '').trim()
  const venue = data.venue_name || null
  let siblings = []
  if (title) {
    let sq = db
      .from('events')
      .select('id, date_start, date_end, ticket_url, price_min, price_max')
      .ilike('title', title)
      .gte('date_start', new Date().toISOString())
      .order('date_start', { ascending: true })
    if (venue) sq = sq.eq('venue_name', venue)
    else if (data.city) sq = sq.eq('city', data.city).is('venue_name', null)
    const { data: sibs } = await sq
    siblings = (sibs || []).map(s => ({
      id: s.id,
      date_start: s.date_start,
      date_end: s.date_end,
      price_min: s.price_min,
      price_max: s.price_max,
      ticket_url: affiliateUrl(s.ticket_url, data.source),
    }))
  }

  return {
    ...transformEvent(data),
    occurrence_count: siblings.length || 1,
    occurrences: siblings,
  }
})

// POST /users — registreer nieuw apparaat
app.post('/users', async (req) => {
  const { device_token, cities = [], categories = [], artists = [] } = req.body ?? {}
  const { data, error } = await db
    .from('users')
    .insert({ device_token, cities, categories, artists })
    .select()
    .single()
  if (error) throw error
  return data
})

// PATCH /users/:id — update voorkeuren
app.patch('/users/:id', async (req) => {
  const { data, error } = await db
    .from('users')
    .update(req.body)
    .eq('id', req.params.id)
    .select()
    .single()
  if (error) throw error
  return data
})

// POST /watchlist — volg een event (sla op voor on-sale notificatie)
app.post('/watchlist', async (req) => {
  const { user_id, event_id, notify_on_sale = true, notify_reminder = false } = req.body ?? {}
  if (!user_id || !event_id) return app.httpErrors?.badRequest('user_id en event_id zijn verplicht')
  const { data, error } = await db
    .from('watchlist')
    .upsert({ user_id, event_id, notify_on_sale, notify_reminder }, { onConflict: 'user_id,event_id' })
    .select()
    .single()
  if (error) throw error
  return data
})

// DELETE /watchlist — verwijder uit watchlist
app.delete('/watchlist', async (req) => {
  const { user_id, event_id } = req.body ?? {}
  const { error } = await db
    .from('watchlist')
    .delete()
    .eq('user_id', user_id)
    .eq('event_id', event_id)
  if (error) throw error
  return { ok: true }
})

// GET /watchlist/:user_id — geef gevolgde events terug
app.get('/watchlist/:user_id', async (req) => {
  const { data, error } = await db
    .from('watchlist')
    .select('id, notify_on_sale, notify_reminder, notified_at, events(*)')
    .eq('user_id', req.params.user_id)
  if (error) throw error
  return data
})

// POST /admin/aggregate — handmatig triggeren
app.post('/admin/aggregate', async () => {
  const count = await runAggregation()
  return { ok: true, events: count }
})

// GET /health
app.get('/health', async () => ({ ok: true, time: new Date().toISOString() }))

// ─── Cron jobs ────────────────────────────────────────────────────────────────

// Elke 4 uur: nieuwe events ophalen en gebruikers notificeren
cron.schedule('0 */4 * * *', async () => {
  await runAggregation()
  await notifyUsers()
})

// Elke 3 uur: controleer watchlist op nieuw beschikbare tickets
cron.schedule('30 */3 * * *', async () => {
  await checkWatchlist()
})

// ─── Start ───────────────────────────────────────────────────────────────────

const PORT = Number(process.env.PORT ?? 3000)

app.listen({ port: PORT, host: '0.0.0.0' }, async (err) => {
  if (err) { console.error(err); process.exit(1) }
  console.log(`\nKulturr backend draait op http://localhost:${PORT}`)
  await runAggregation()
})
