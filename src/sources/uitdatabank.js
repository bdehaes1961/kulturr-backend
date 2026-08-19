import axios from 'axios'
import 'dotenv/config'

const CLIENT_ID     = process.env.UITDATABANK_CLIENT_ID
const CLIENT_SECRET = process.env.UITDATABANK_CLIENT_SECRET
const BASE_URL      = 'https://search-test.uitdatabank.be/events'
const AUTH_URL      = 'https://account-test.uitid.be/realms/uitid/protocol/openid-connect/token'
const PAGE_SIZE     = 30

const CATEGORY_MAP = {
  muziek: 'muziek', theater: 'theater', dans: 'dans', expo: 'expo',
  festival: 'festival', film: 'overig', cursus: 'overig', lezing: 'overig', overig: 'overig',
}

let tokenCache = { token: null, expiresAt: 0 }

function sleep(ms) { return new Promise(r => setTimeout(r, ms)) }

async function getAccessToken() {
  if (tokenCache.token && Date.now() < tokenCache.expiresAt) return tokenCache.token
  const body = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: CLIENT_ID,
    client_secret: CLIENT_SECRET,
  })
  const { data } = await axios.post(AUTH_URL, body.toString(), {
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    timeout: 10000,
  })
  tokenCache.token = data.access_token
  tokenCache.expiresAt = Date.now() + (data.expires_in - 300) * 1000
  return tokenCache.token
}

function normalizeUitEvent(raw) {
  const name      = raw.name?.nl || raw.name?.fr || raw.name?.en || Object.values(raw.name || {})[0] || 'Onbekend'
  const location  = raw.location
  const city      = location?.address?.addressLocality || location?.name?.nl || null
  const venueName = location?.name?.nl || location?.name?.fr || null
  const dateStart = raw.startDate || raw.availableFrom || null
  const dateEnd   = raw.endDate || null
  const rawType   = (raw.terms || []).find(t => t.domain === 'eventtype')?.label?.nl?.toLowerCase() || 'overig'
  const category  = CATEGORY_MAP[Object.keys(CATEGORY_MAP).find(k => rawType.includes(k)) || 'overig'] || 'overig'
  const image     = raw.mediaObject?.find(m => m['@type'] === 'schema:ImageObject')?.contentUrl || null
  return {
    source: 'uitdatabank', external_id: raw['@id']?.split('/').pop() || raw.id || null,
    title: name, venue_name: venueName, city, date_start: dateStart, date_end: dateEnd,
    price_min: null, price_max: null, category, image_url: image,
    ticket_url: raw.bookingInfo?.url || null,
    description: raw.description?.nl?.substring(0, 500) || null, artists: [], raw,
  }
}

export async function fetchUitEvents() {
  if (!CLIENT_ID || !CLIENT_SECRET) {
    console.warn('[UiTdatabank] Geen credentials gevonden.')
    console.warn('[UiTdatabank] Stel UITDATABANK_CLIENT_ID en UITDATABANK_CLIENT_SECRET in.')
    return []
  }
  let token
  try {
    token = await getAccessToken()
    console.log('[UiTdatabank] OAuth token verkregen')
  } catch (err) {
    console.error('[UiTdatabank] OAuth token ophalen mislukt:', err.message, 'status:', err.response?.status, 'body:', JSON.stringify(err.response?.data))
    return []
  }
  const today        = new Date()
  const inNinetyDays = new Date(today.getTime() + 90 * 24 * 60 * 60 * 1000)
  const dateFrom     = today.toISOString().split('T')[0]
  const dateTo       = inNinetyDays.toISOString().split('T')[0]
  const allEvents    = []
  let start = 0
  let total = null
  while (total === null || start < total) {
    try {
      const { data } = await axios.get(BASE_URL, {
        headers: { Authorization: `Bearer ${token}` },
        params:  { dateFrom, dateTo, limit: PAGE_SIZE, start },
        timeout: 15000,
      })
      if (total === null) {
        total = data.totalItems || 0
        console.log('[UiTdatabank] Totaal: ' + total + ' events')
      }
      const events = (data.member || data['hydra:member'] || []).map(normalizeUitEvent)
      allEvents.push(...events)
      start += PAGE_SIZE
      if (start < total) await sleep(200)
    } catch (err) {
      const status = err.response?.status
      if (status === 401 || status === 403) {
        console.error(`[UiTdatabank] ${status}: credentials ongeldig. Controleer CLIENT_ID en CLIENT_SECRET`)
      } else {
        console.error('[UiTdatabank] Fout:', err.message, 'status:', status, 'body:', JSON.stringify(err.response?.data))
      }
      break
    }
  }
  console.log('[UiTdatabank] ' + allEvents.length + ' events opgehaald')
  return allEvents
}
