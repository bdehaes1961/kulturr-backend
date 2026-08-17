import axios from 'axios'
import 'dotenv/config'

const API_KEY = process.env.UITDATABANK_API_KEY
const BASE_URL = 'https://search.uitdatabank.be/events/'
const PAGE_SIZE = 30

const CATEGORY_MAP = {
  muziek: 'muziek',
  theater: 'theater',
  dans: 'dans',
  expo: 'expo',
  festival: 'festival',
  film: 'overig',
  cursus: 'overig',
  lezing: 'overig',
  overig: 'overig',
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms))
}

function normalizeUitEvent(raw) {
  const name = raw.name?.nl || raw.name?.fr || raw.name?.en || Object.values(raw.name || {})[0] || 'Onbekend'
  const location = raw.location
  const city = location?.address?.addressLocality || location?.name?.nl || null
  const venueName = location?.name?.nl || location?.name?.fr || null

  const dateInfo = raw.calendarSummary?.nl?.text || ''
  const dateStart = raw.startDate || raw.availableFrom || null
  const dateEnd = raw.endDate || null

  const rawType = (raw.terms || []).find(t => t.domain === 'eventtype')?.label?.nl?.toLowerCase() || 'overig'
  const category = CATEGORY_MAP[Object.keys(CATEGORY_MAP).find(k => rawType.includes(k)) || 'overig'] || 'overig'

  const image = raw.mediaObject?.find(m => m['@type'] === 'schema:ImageObject')?.contentUrl || null

  return {
    source: 'uitdatabank',
    external_id: raw['@id']?.split('/').pop() || raw.id || null,
    title: name,
    venue_name: venueName,
    city,
    date_start: dateStart,
    date_end: dateEnd,
    price_min: null,
    price_max: null,
    category,
    image_url: image,
    ticket_url: raw.bookingInfo?.url || null,
    description: raw.description?.nl?.substring(0, 500) || null,
    artists: [],
    raw,
  }
}

export async function fetchUitEvents() {
  if (!API_KEY) {
    console.warn('[UiTdatabank] Geen API key (UITDATABANK_API_KEY) — sla over')
    return []
  }

  const today = new Date()
  const inNinetyDays = new Date(today.getTime() + 90 * 24 * 60 * 60 * 1000)
  const dateFrom = today.toISOString().split('T')[0]
  const dateTo = inNinetyDays.toISOString().split('T')[0]

  const allEvents = []
  let start = 0
  let total = null

  while (total === null || start < total) {
    try {
      const { data } = await axios.get(BASE_URL, {
        headers: { 'X-Api-Key': API_KEY },
        params: {
          dateFrom,
          dateTo,
          regionFilter: 'gem-gent|gem-antwerpen|gem-brussel|gem-leuven|gem-mechelen|gem-hasselt|gem-brugge|gem-kortrijk|gem-aalst|gem-sint-niklaas',
          limit: PAGE_SIZE,
          start,
          embed: true,
          availableFrom: dateFrom,
        },
        timeout: 15000,
      })

      if (total === null) {
        total = data.totalItems || 0
        console.log(`[UiTdatabank] Totaal: ${total} events`)
      }

      const events = (data.member || data['hydra:member'] || []).map(normalizeUitEvent)
      allEvents.push(...events)

      console.log(`[UiTdatabank] ${start + events.length}/${total} opgehaald`)
      start += PAGE_SIZE
      if (start < total) await sleep(200)
    } catch (err) {
      const status = err.response?.status
      if (status === 401) {
        console.error('[UiTdatabank] 401: API key ongeldig of verlopen. Controleer UITDATABANK_API_KEY.')
      } else {
        console.error('[UiTdatabank] Ophalen mislukt:', err.message)
      }
      break
    }
  }

  console.log(`[UiTdatabank] ${allEvents.length} events opgehaald`)
  return allEvents
}
