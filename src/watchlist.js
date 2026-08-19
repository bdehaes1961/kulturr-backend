import { db }                from './db.js'
import { fetchSingleUitEvent } from './sources/uitdatabank.js'

/**
 * Checkt elke 3 uur of tickets beschikbaar zijn geworden voor gevolgde events.
 * Wordt aangeroepen vanuit index.js via node-cron.
 *
 * Logica:
 *  1. Haal alle watchlist-rijen op waarbij notify_on_sale=true en notified_at=null
 *  2. Filter op events waarbij ticket_url nog null is (verkoop nog niet gestart)
 *  3. Re-fetch elk event via UiTdatabank enkelvoudige lookup
 *  4. Als ticket_url nu aanwezig is → update event, stuur push, markeer als verzonden
 */
export async function checkWatchlist() {
  console.log('[Watchlist] Check gestart —', new Date().toLocaleString('nl-BE'))

  const { data: items, error } = await db
    .from('watchlist')
    .select(`
      id, user_id, notify_on_sale,
      events ( id, external_id, source, title, venue_name, city, ticket_url )
    `)
    .eq('notify_on_sale', true)
    .is('notified_at', null)

  if (error) {
    console.error('[Watchlist] DB fout:', error.message)
    return
  }

  if (!items?.length) {
    console.log('[Watchlist] Geen gevolgde events zonder ticket URL')
    return
  }

  // Alleen UiTdatabank-events zonder ticket_url
  const toCheck = items.filter(i => !i.events?.ticket_url && i.events?.source === 'uitdatabank')
  console.log(`[Watchlist] ${toCheck.length} events te controleren op ticketbeschikbaarheid`)

  for (const item of toCheck) {
    const event = item.events
    try {
      const updated = await fetchSingleUitEvent(event.external_id)
      if (!updated?.ticket_url) continue  // nog geen tickets

      console.log(`[Watchlist] Tickets beschikbaar voor "${event.title}"`)

      // 1. Update ticket_url in events tabel
      await db.from('events')
        .update({ ticket_url: updated.ticket_url })
        .eq('id', event.id)

      // 2. Stuur push notificatie naar de watcher
      const { data: user } = await db
        .from('users').select('*').eq('id', item.user_id).single()

      if (user?.device_token) {
        await sendOnSaleNotification(user, { ...event, ticket_url: updated.ticket_url })
      }

      // 3. Markeer als verzonden zodat we niet opnieuw sturen
      await db.from('watchlist')
        .update({ notified_at: new Date().toISOString() })
        .eq('id', item.id)

    } catch (err) {
      console.error(`[Watchlist] Fout bij "${event.title}":`, err.message)
    }
  }

  console.log('[Watchlist] Check klaar')
}

async function sendOnSaleNotification(user, event) {
  console.log(`[Push/OnSale] → ${user.id}: "${event.title}" tickets beschikbaar`)

  // TODO: vervang door echte Firebase Admin SDK aanroep
  // import { getMessaging } from 'firebase-admin/messaging'
  // await getMessaging().send({
  //   token: user.device_token,
  //   notification: {
  //     title: `🎫 Tickets beschikbaar — ${event.title}`,
  //     body: `${event.venue_name} · ${event.city}`,
  //   },
  //   data: {
  //     event_id: event.id,
  //     ticket_url: event.ticket_url,
  //     type: 'on_sale',
  //   },
  // })
}
