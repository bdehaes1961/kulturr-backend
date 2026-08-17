import axios from 'axios'
import 'dotenv/config'

const BASE_URL = 'https://search.uitdatabank.be/events/'

// Haal events op voor de komende 90 dagen
export async function fetchUitEvents({ start = 0, limit = 30 } = {}) {
  const dateFrom = new Date().toISOString()
  const dateTo   = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000).toISOString()

  const headers = { Accept: 'application/json' }
  if (process.env.UITDATABANK_API_KEY) {
    headers['X-Api-Key'] = process.env.UITDATABANK_API_KEY
  }

  const { data } = await axios.get(BASE_URL, {
    headers,
    params: { embed: true, limit, start, dateFrom, dateTo },
    timeout: 10_000,
  })

  return data.member ?? []
}

// Haal alles op via paginatie
export async function fetchAllUitEvents() {
  const PAGE = 30
  let start = 0
  let all   = []

  while (true) {
    const page = await fetchUitEvents({ start, limit: PAGE })
    if (!page.length) break
    all   = all.concat(page)
    start += PAGE
    if (page.length < PAGE) break
    await sleep(200)
  }

  console.log(`[UiTdatabank] ${all.length} events opgehaald`)
  return all
}

// Normaliseer naar ons gemeenschappelijk formaat
export function normalizeUitEvent(raw) {
  const loc = raw.location ?? {}
  const addr = loc.address ?? {}

  return {
    external_id: raw['@id'] ?? raw.id,
    source:      'uitdatabank',
    title:       raw.name?.nl ?? raw.name?.fr ?? 'Onbekend',
    venue_name:  loc.name?.nl ?? loc.name?.fr ?? null,
    city:        addr.addressLocality ?? null,
    date_start:  raw.startDate ?? null,
    date_end:    raw.endDate   ?? null,
    price_min:   extractPrice(raw, 'min'),
    price_max:   extractPrice(raw, 'max'),
    category:    mapCategory(raw.terms ?? []),
    image_url:   raw.mediaObject?.[0]?.contentUrl ?? null,
    ticket_url:  raw.bookingInfo?.url ?? null,
    description: raw.description?.nl ?? raw.description?.fr ?? null,
    artists:     [],
    raw,
  }
}

function extractPrice(event, type) {
  const prices = (event.priceInfo ?? [])
    .map(p => Number(p.price))
    .filter(n => !isNaN(n) && n > 0)
  if (!prices.length) return null
  return type === 'min' ? Math.min(...prices) : Math.max(...prices)
}

const CATEGORY_MAP = {
  muziek:       ['concert', 'muziek', 'rock', 'pop', 'jazz', 'klassiek', '0.50.4.0.0'],
  theater:      ['theater', 'toneel', '0.55.0.0.0'],
  dans:         ['dans', 'ballet', '0.54.0.0.0'],
  expo:         ['tentoonstelling', 'expo', '0.0.0.0.0'],
  festival:     ['festival', '0.5.0.0.0'],
}

function mapCategory(terms) {
  const ids    = terms.map(t => (t.id ?? '').toLowerCase())
  const labels = terms.map(t => (t.label?.nl ?? t.label ?? '').toLowerCase())
  const haystack = [...ids, ...labels].join(' ')

  for (const [cat, keywords] of Object.entries(CATEGORY_MAP)) {
    if (keywords.some(kw => haystack.includes(kw))) return cat
  }
  return 'overig'
}

const sleep = ms => new Promise(r => setTimeout(r, ms))
