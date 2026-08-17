import 'dotenv/config'
import Fastify from 'fastify'
import cron    from 'node-cron'
import { db }  from './db.js'
import { runAggregation, notifyUsers } from './aggregator.js'

const app = Fastify({ logger: true })

// ─── Routes ──────────────────────────────────────────────────────────────────

// GET /events  — feed voor de app
// Queryparams: city, category, limit (default 20), offset (default 0)
app.get('/events', async (req) => {
  const { city, category, limit = 20, offset = 0 } = req.query

  let query = db
    .from('events')
    .select('id, title, venue_name, city, date_start, price_min, category, image_url, ticket_url, artists')
    .gte('date_start', new Date().toISOString())
    .order('date_start', { ascending: true })
    .range(Number(offset), Number(offset) + Number(limit) - 1)

  if (city)     query = query.eq('city', city)
  if (category) query = query.eq('category', category)

  const { data, error } = await query
  if (error) throw error
  return data
})

// GET /events/:id  — detail
app.get('/events/:id', async (req) => {
  const { data, error } = await db
    .from('events')
    .select('*')
    .eq('id', req.params.id)
    .single()
  if (error) throw error
  return data
})

// POST /users  — registreer nieuw apparaat
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

// PATCH /users/:id  — update voorkeuren
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

// POST /admin/aggregate  — handmatig triggeren
app.post('/admin/aggregate', async () => {
  const count = await runAggregation()
  return { ok: true, events: count }
})

// GET /health
app.get('/health', async () => ({ ok: true, time: new Date().toISOString() }))

// ─── Cron jobs ────────────────────────────────────────────────────────────────

// Elke 4 uur nieuwe events ophalen
cron.schedule('0 */4 * * *', async () => {
  await runAggregation()
  await notifyUsers()
})

// ─── Start ───────────────────────────────────────────────────────────────────

const PORT = Number(process.env.PORT ?? 3000)

app.listen({ port: PORT, host: '0.0.0.0' }, async (err) => {
  if (err) { console.error(err); process.exit(1) }
  console.log(`\nKulturr backend draait op http://localhost:${PORT}`)

  // Meteen één run bij opstarten
  await runAggregation()
})
