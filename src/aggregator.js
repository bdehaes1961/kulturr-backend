import { db } from './db.js'
import { fetchAllUitEvents, normalizeUitEvent } from './sources/uitdatabank.js'
import { fetchAllBandsintownEvents } from './sources/bandsintown.js'

// Sla één event op — upsert op source + external_id
async function upsertEvent(event) {
  const { error } = await db
    .from('events')
    .upsert(event, { onConflict: 'source,external_id', ignoreDuplicates: false })

  if (error) console.error('[DB] Upsert fout:', error.message, event.title)
}

// Dedupliceer events uit verschillende bronnen op titel + venue + datum
function buildDedupeKey(event) {
  const date = event.date_start
    ? new Date(event.date_start).toISOString().slice(0, 10)
    : 'onbekend'
  const title = (event.title ?? '').toLowerCase().trim()
  const venue = (event.venue_name ?? '').toLowerCase().trim()
  return `${title}|${venue}|${date}`
}

// Hoofdfunctie: haal alles op, normaliseer, sla op
export async function runAggregation() {
  console.log('\n[Aggregator] Start —', new Date().toLocaleString('nl-BE'))

  const allEvents = []

  // --- UiTdatabank ---
  try {
    const raw = await fetchAllUitEvents()
    allEvents.push(...raw.map(normalizeUitEvent))
  } catch (err) {
    console.error('[UiTdatabank] Ophalen mislukt:', err.message)
  }

  // --- Bandsintown ---
  try {
    const events = await fetchAllBandsintownEvents()
    allEvents.push(...events)
  } catch (err) {
    console.error('[Bandsintown] Ophalen mislukt:', err.message)
  }

  // Dedupliceer binnen dezelfde run
  const seen  = new Map()
  const dedup = []

  for (const ev of allEvents) {
    const key = buildDedupeKey(ev)
    if (!seen.has(key)) {
      seen.set(key, true)
      dedup.push(ev)
    }
  }

  console.log(`[Aggregator] ${allEvents.length} events opgehaald → ${dedup.length} na deduplicatie`)

  // Sla op in batches van 50
  const BATCH = 50
  for (let i = 0; i < dedup.length; i += BATCH) {
    await Promise.all(dedup.slice(i, i + BATCH).map(upsertEvent))
  }

  console.log('[Aggregator] Klaar\n')
  return dedup.length
}

// Stuur push-notificaties voor nieuwe events die matchen met gebruikersvoorkeuren
export async function notifyUsers() {
  const since = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString()

  const { data: newEvents, error } = await db
    .from('events')
    .select('*')
    .gte('created_at', since)

  if (error || !newEvents?.length) return

  const { data: users } = await db.from('users').select('*')
  if (!users?.length) return

  for (const event of newEvents) {
    for (const user of users) {
      const cityMatch     = !user.cities?.length     || user.cities.includes(event.city)
      const categoryMatch = !user.categories?.length || user.categories.includes(event.category)
      const artistMatch   = user.artists?.some(a =>
        event.artists?.map(x => x.toLowerCase()).includes(a.toLowerCase())
      )

      if (cityMatch && (categoryMatch || artistMatch)) {
        await sendPush(user, event)
      }
    }
  }
}

// Plaatshouder — vervang door Firebase Admin SDK
async function sendPush(user, event) {
  if (!user.device_token) return

  console.log(`[Push] → ${user.id}: "${event.title}" (${event.city})`)

  // TODO: implementeer met firebase-admin
  // import { getMessaging } from 'firebase-admin/messaging'
  // await getMessaging().send({
  //   token: user.device_token,
  //   notification: { title: event.title, body: `${event.venue_name} · ${event.city}` },
  //   data: { event_id: event.id, ticket_url: event.ticket_url ?? '' },
  // })
}
