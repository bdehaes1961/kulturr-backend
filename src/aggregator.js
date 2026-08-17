import { db } from './db.js'
import { fetchUitEvents } from './sources/uitdatabank.js'
import { fetchAllBandsintownEvents } from './sources/bandsintown.js'
import { fetchTicketmasterEvents } from './sources/ticketmaster.js'

export async function upsertEvent(event) {
  const { error } = await db.from('events').upsert(event, {
    onConflict: 'source,external_id',
    ignoreDuplicates: false,
  })
  if (error) console.error('[DB] Upsert fout:', error.message)
}

export function buildDedupeKey(event) {
  const date = event.date_start ? event.date_start.substring(0, 10) : ''
  return `${(event.title || '').toLowerCase()}|${(event.venue_name || '').toLowerCase()}|${date}`
}

export async function runAggregation() {
  console.log('[Aggregator] Start —', new Date().toLocaleString('nl-BE'))

  // Haal events op uit alle bronnen
  const [uitEvents, bandsintownEvents, ticketmasterEvents] = await Promise.allSettled([
    fetchUitEvents(),
    fetchAllBandsintownEvents(),
    fetchTicketmasterEvents(),
  ])

  const allRaw = [
    ...(uitEvents.status === 'fulfilled' ? uitEvents.value : []),
    ...(bandsintownEvents.status === 'fulfilled' ? bandsintownEvents.value : []),
    ...(ticketmasterEvents.status === 'fulfilled' ? ticketmasterEvents.value : []),
  ]

  console.log(`[Aggregator] ${allRaw.length} events opgehaald → dedupliceren`)

  // Dedupliceer op title|venue|date key
  const seen = new Map()
  const deduped = []
  for (const event of allRaw) {
    const key = buildDedupeKey(event)
    if (!seen.has(key)) {
      seen.set(key, true)
      deduped.push(event)
    }
  }

  console.log(`[Aggregator] ${deduped.length} events na deduplicatie`)

  // Batch upsert in chunks van 50
  const CHUNK = 50
  for (let i = 0; i < deduped.length; i += CHUNK) {
    const chunk = deduped.slice(i, i + CHUNK)
    await Promise.all(chunk.map(upsertEvent))
  }

  console.log('[Aggregator] Klaar')

  // Notificeer gebruikers
  await notifyUsers()
}

export async function notifyUsers() {
  const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString()
  const { data: recentEvents } = await db
    .from('events')
    .select('*')
    .gte('created_at', twoHoursAgo)

  if (!recentEvents?.length) return

  const { data: users } = await db.from('users').select('*')
  if (!users?.length) return

  for (const user of users) {
    for (const event of recentEvents) {
      const cityMatch = !user.cities?.length || user.cities.includes(event.city)
      const catMatch = !user.categories?.length || user.categories.includes(event.category)
      const artistMatch = !user.artists?.length || event.artists?.some(a => user.artists.includes(a))

      if (cityMatch && (catMatch || artistMatch)) {
        await sendPush(user, event)
      }
    }
  }
}

export async function sendPush(user, event) {
  // TODO: Firebase Admin SDK implementeren
  console.log(`[Push] Zou sturen naar ${user.id}: ${event.title}`)
}
