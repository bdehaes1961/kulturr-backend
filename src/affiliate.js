// Affiliate URL transformer
// Ticketmaster ticket_urls worden omgezet naar CJ-affiliate links
// zodat Kulturr commissie verdient op elke verkochte ticket.
//
// Setup:
//  1. Registreer op cj.com als publisher
//  2. Zoek "Ticketmaster Belgium" in de adverteerderscatalogus en vraag toegang
//  3. Kopieer je Publisher ID en het Ticketmaster Advertiser ID
//  4. Voeg toe aan Railway env vars: CJ_PUBLISHER_ID, CJ_TICKETMASTER_AID

const CJ_PID = process.env.CJ_PUBLISHER_ID       // jouw CJ Publisher ID
const CJ_AID = process.env.CJ_TICKETMASTER_AID    // Ticketmaster Advertiser ID op CJ (~ 14-cijferig)

/**
 * Zet een ticket_url om naar een affiliate-trackinglink.
 * Als de CJ-credentials niet zijn ingesteld, wordt de originele URL teruggegeven.
 *
 * @param {string|null} url      - originele ticket URL
 * @param {string}      source   - 'ticketmaster' | 'uitdatabank' | ...
 * @returns {string|null}
 */
export function affiliateUrl(url, source) {
  if (!url) return null

  if (source === 'ticketmaster' && CJ_PID && CJ_AID) {
    // CJ deep-link formaat: https://www.tkqlhce.com/click-{PID}-{AID}?url={encoded}
    return `https://www.tkqlhce.com/click-${CJ_PID}-${CJ_AID}?url=${encodeURIComponent(url)}`
  }

  // Andere bronnen: directe link (later uitbreidbaar)
  return url
}
