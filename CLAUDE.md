# Kulturr — werkgeheugen

> Bron van waarheid = de code op GitHub (laatst gecontroleerd 2026-10-07).
> Dit bestand staat identiek in `kulturr-backend` én `kulturr-frontend` — pas beide aan als er iets verandert.
> Het oude `HANDOVER.md` (2026-08-20, in Berts lokale Kulturr-map) is deels **verouderd** (env-namen, Awin→CJ, cron, schema, endpoints).

## Project
- Kulturr — Belgische culturele event-discovery app (BE + NL), taal: Nederlands (Belgisch)
- Concept: Tinder-achtig swipen door events; opslaan, watchlist, tickets via affiliate-links
- Eigenaar: Bert De Haes (GitHub: `bdehaes1961`)
- Domein: kulturr.be (DNS nog niet ingesteld)

## UI-voorkeur (Bert)
- **Swipe feed** is de hoofdinterface
  - Grote kaarten, event-foto als achtergrond, prijs zichtbaar op kaart
  - Actieknoppen onderaan (hart / X / bladwijzer)
  - Categoriekleuren: groen = muziek, paars = theater, oranje = expo (roze = dans, geel = festival, grijs = overig)
  - Bron discreet onderaan de kaart
  - Tab-navigatie onderaan: Ontdek / Opgeslagen / Watchlist / Profiel

## Architectuur
UiTdatabank + Ticketmaster → aggregator (node-cron) → Supabase → Fastify API (Railway) → Next.js (Vercel)

| Laag | Tech | Waar |
|---|---|---|
| Backend | Node 18+ ESM, Fastify 4, node-cron | Railway `rare-adventure`, auto-deploy bij push op `main` — https://kulturr-backend-production.up.railway.app |
| Database | Supabase PostgreSQL | EU (Frankfurt), project `ebsiwgckrjbkdehnnicg` |
| Frontend | Next.js 14.2 App Router + Tailwind | Vercel, team Kulturr (Pro Trial) |
| Push | Firebase Cloud Messaging | nog niet gebouwd |

## Repos (branch `main`)
- github.com/bdehaes1961/kulturr-backend
- github.com/bdehaes1961/kulturr-frontend
- ⚠️ In Berts lokale Kulturr-map staat een **oude kopie** van `kulturr-frontend/` (19 aug, geen commits) — niet gebruiken, werk vanuit GitHub.

## Backend
- `src/index.js` (server, routes, cron), `db.js` (Supabase client), `aggregator.js`, `watchlist.js`, `affiliate.js`, `sources/uitdatabank.js`, `sources/ticketmaster.js`, `schema.sql`
- Endpoints:
  - `GET /events` — city, category, limit (20), offset; **gegroepeerd** per (titel, venue) met `occurrences[]` en `occurrence_count`; alleen toekomstige events
  - `GET /events/:id` — detail + sibling occurrences
  - `POST /users`, `PATCH /users/:id` — apparaat/voorkeuren
  - `POST /watchlist`, `DELETE /watchlist` (body: user_id, event_id), `GET /watchlist/:user_id`
  - `POST /admin/aggregate`, `GET /health`
- Cron: elke 4u aggregeren + `notifyUsers()`; elke 3u (:30) `checkWatchlist()`; ook aggregatie bij opstart
- CORS: kulturr-frontend.vercel.app, previews `kulturr-frontend-*.vercel.app`, kulturr.be, www, localhost:3000
- Tabellen: `events` (external_id, source, title, venue_name, city, date_start/end, price_min/max, category, image_url, ticket_url, description, artists[], raw jsonb — uniek op source+external_id), `users` (device_token, cities, categories, artists), `notifications`, `watchlist` (notify_on_sale, notify_reminder, notified_at)

## Bronnen
- UiTdatabank SAPI v3 (primair, ~6000+ events/run, 90 dagen vooruit) — OAuth2 client credentials; draait nog op **test** (`search-test.uitdatabank.be`, `account-test.uitid.be`)
- Ticketmaster Discovery API v2, BE/NL — actief
- Affiliate: **CJ** (niet Awin) voor Ticketmaster; zonder env vars worden gewone links gebruikt

## Frontend
- `src/app/(marketing)/`: landing `/`, `/events` (grid), `/event/[id]`, `/over`, `/contact`, `/privacy`, `/cookies`, `/voorwaarden`
- `src/app/app/page.js`: swipe-app op `/app`
- Componenten: EventCard, EventGridCard, CategoryPill, CategoryFilters, BottomNav, CookieBanner, KeyboardBack, Prose
- `sitemap.js`, `robots.js`; alias `@/` via jsconfig.json

## Secrets — afspraak
- Sleutels staan **alleen** in een lokaal `.env`-bestand per repo (staat in `.gitignore`) en in de dashboards van Railway / Vercel.
- **Nooit** sleutels in dit bestand, `HANDOVER.md`, commits, logs of chat zetten of tonen.
- Lees `.env` alleen als een taak het echt nodig heeft; gebruik waarden zonder ze te herhalen.
- `SUPABASE_SERVICE_KEY` = volledige DB-toegang (omzeilt RLS) — bij voorkeur anon key of read-only rol gebruiken.
- Backend-variabelen (zoals in de code): `SUPABASE_URL`, `SUPABASE_SERVICE_KEY`, `UITDATABANK_CLIENT_ID`, `UITDATABANK_CLIENT_SECRET`, `TICKETMASTER_API_KEY`, `CJ_PUBLISHER_ID`, `CJ_TICKETMASTER_AID`, `PORT`
- Frontend: `NEXT_PUBLIC_API_URL`

## Open punten
- Vercel-build: status onbekend sinds 20 aug — build log checken
- DNS kulturr.be → A `@` 76.76.21.21, CNAME `www` cname.vercel-dns.com, daarna domein toevoegen in Vercel
- Firebase push (`notifyUsers()` / watchlist-notificatie zijn placeholders)
- UiTdatabank naar productie (endpoint + token-URL + nieuwe client credentials)
- Bevindingen code-review 2026-10-07:
  - **`/app` swipe werkt niet**: page geeft `onSwipe` door, EventCard verwacht `onLike/onSkip/onSave/isTop` → slepen en knoppen doen niets
  - swipe-labels JA/NEE in EventCard omgewisseld (kant + kleur)
  - Opgeslagen alleen in geheugen; Watchlist niet aan API gekoppeld
  - geen auth op `POST /admin/aggregate`, `PATCH /users/:id` (accepteert willekeurige velden), watchlist-routes
  - backend `.env.example` en README verouderd (Bandsintown, `UITDATABANK_API_KEY`, server.js/scheduler.js)
  - `framer-motion` ongebruikt

## Mockups (in Berts lokale Kulturr-map, niet in de repo's)
`culturele_app_swipe_mockup.html`, `kulturr_app_v3_fotos.html`, `kulturr_notificaties.html`, `kulturr_onboarding.html`
