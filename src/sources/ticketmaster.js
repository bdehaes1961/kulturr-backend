import axios from 'axios'
import 'dotenv/config'

const API_KEY = process.env.TICKETMASTER_API_KEY
const BASE_URL = 'https://app.ticketmaster.com/discovery/v2/events.json'
const PAGE_SIZE = 200

const CATEGORY_MAP = {
  'Music': 'muziek',
  'Arts & Theatre': 'theater',
  'Sports': 'overig',
  'Film': 'overig',
  'Miscellaneous': 'overig',
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms))
}

function normalizeEvent(raw) {
  const venue = raw._embedded?.venues?.[0]
  const dateInfo = raw.dates?.start
  const priceRange = raw.priceRanges?.[0]
  const segment = raw.classifications?.[0]?.segment?.name || 'overig'
  const genre = raw.classifications?.[0]?.genre?.name || ''

  let category = CATEGORY_MAP[segment] || 'overig'
  if (genre.toLowerCase().includes('classical') || genre.toLowerCase().includes('opera')) category = 'klassiek'
  if (genre.toLowerCase().includes('dance') || genre.toLowerCase().includes('electronic')) category = 'muziek'

  return {
    source: 'ticketmaster',
    external_id: raw.id,
    title: raw.name,
    venue_name: venue?.name || null,
    city: venue?.city?.name || null,
    date_start: dateInfo?.dateTime || (dateInfo?.localDate ? dateInfo.localDate + 'T00:00:00Z' : null),
    date_end: null,
    price_min: priceRange?.min ?? null,
    price_max: priceRange?.max ?? null,
    category,
    image_url: raw.images?.find(i => i.ratio === '16_9' && i.width > 500)?.url || raw.images?.[0]?.url || null,
    ticket_url: raw.url || null,
    description: null,
    artists: raw._embedded?.attractions?.map(a => a.name) || [],
    raw,
  }
}

export async function fetchTicketmasterEvents() {
  if (!API_KEY) {
    console.warn('[Ticketmaster] Geen API key — sla over')
    return []
  }

  const today = new Date()
  const inNinetyDays = new Date(today.getTime() + 90 * 24 * 60 * 60 * 1000)
  const startDateTime = today.toISOString().split('.')[0] + 'Z'
  const endDateTime = inNinetyDays.toISOString().split('.')[0] + 'Z'

  const allEvents = []
  let page = 0
  let totalPages = 1

  while (page < totalPages && page < 5) {
    try {
      const { data } = await axios.get(BASE_URL, {
        params: {
          apikey: API_KEY,
          countryCode: 'BE',
          startDateTime,
          endDateTime,
          size: PAGE_SIZE,
          page,
          sort: 'date,asc',
        },
        timeout: 15000,
      })

      const events = data?._embedded?.events || []
      totalPages = data?.page?.totalPages || 1
      allEvents.push(...events.map(normalizeEvent))

      console.log(`[Ticketmaster] Pagina ${page + 1}/${Math.min(totalPages, 5)}: ${events.length} events`)
      page++
      if (page < totalPages) await sleep(300)
    } catch (err) {
      console.error(`[Ticketmaster] Fout op pagina ${page}:`, err.message)
      break
    }
  }

  console.log(`[Ticketmaster] Totaal: ${allEvents.length} events opgehaald`)
  return allEvents
}
