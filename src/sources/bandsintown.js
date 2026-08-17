import axios from 'axios'
import 'dotenv/config'

const BASE_URL = 'https://rest.bandsintown.com/artists'
const APP_ID   = process.env.BANDSINTOWN_APP_ID ?? 'kulturr'

// Artiesten om standaard te volgen (uitbreidbaar)
export const DEFAULT_ARTISTS = [
  'Balthazar', 'Stromae', 'Editors', 'Compact Disk Dummies',
  'Warhaus', 'Hercules & Love Affair', 'Amenra', 'Zwangere Guy',
  'Lana Del Rey', 'Radiohead', 'Nick Cave', 'PJ Harvey',
  'Fontaines DC', 'shame', 'Dry Cleaning',
]

// Haal concerten op voor één artiest
export async function fetchArtistEvents(artistName) {
  try {
    const encoded = encodeURIComponent(artistName)
    const { data } = await axios.get(
      `${BASE_URL}/${encoded}/events`,
      { params: { app_id: APP_ID }, timeout: 8_000 }
    )

    // Filter op België / buurlanden
    return (data ?? []).filter(ev =>
      ['BE', 'NL', 'LU', 'FR', 'DE'].includes(ev.venue?.country)
    )
  } catch (err) {
    if (err.response?.status === 404) return []
    console.warn(`[Bandsintown] Fout voor ${artistName}:`, err.message)
    return []
  }
}

// Haal events op voor een lijst van artiesten
export async function fetchAllBandsintownEvents(artists = DEFAULT_ARTISTS) {
  const results = []

  for (const artist of artists) {
    const events = await fetchArtistEvents(artist)
    results.push(...events.map(ev => normalizeBAEvent(ev, artist)))
    await sleep(150)
  }

  console.log(`[Bandsintown] ${results.length} events opgehaald voor ${artists.length} artiesten`)
  return results
}

// Normaliseer naar ons gemeenschappelijk formaat
export function normalizeBAEvent(raw, artistName) {
  const venue  = raw.venue ?? {}
  const offer  = raw.offers?.[0] ?? {}
  const price  = offer.status === 'available' ? parseFloat(offer.min_ticket_price ?? 0) : null

  return {
    external_id: String(raw.id),
    source:      'bandsintown',
    title:       artistName,
    venue_name:  venue.name     ?? null,
    city:        venue.city     ?? null,
    date_start:  raw.datetime   ?? null,
    date_end:    null,
    price_min:   price || null,
    price_max:   null,
    category:    'muziek',
    image_url:   raw.artist_thumbnail_url ?? null,
    ticket_url:  offer.url ?? raw.url ?? null,
    description: raw.description ?? null,
    artists:     [artistName],
    raw,
  }
}

const sleep = ms => new Promise(r => setTimeout(r, ms))
