import 'dotenv/config'
import Fastify from 'fastify'
import cron    from 'node-cron'
import { db }  from './db.js'
import { runAggregation, notifyUsers } from './aggregator.js'
import { checkWatchlist }              from './watchlist.js'
import { affiliateUrl }                from './affiliate.js'

const app = Fastify({ logger: true })

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

  let query = db
    .from('events')
    .select('id, source, title, venue_name, city, date_start, price_min, category, image_url, ticket_url, artists')
    .gte('date_start', new Date().toISOString())
    .order('date_start', { ascending: true })
    .range(Number(offset), Number(offset) + Number(limit) - 1)

  if (city)     query = query.eq('city', city)
  if (category) query = query.eq('category', category)

  const { data, error } = await query
  if (error) throw error
  return (data ?? []).map(transformEvent)
})

// GET /events/:id — detail
app.get('/events/:id', async (req) => {
  const { data, error } = await db
    .from('events')
    .select('*')
    .eq('id', req.params.id)
    .single()
  if (error) throw error
  return transformEvent(data)
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
