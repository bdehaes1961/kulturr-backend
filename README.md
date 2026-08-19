# Kulturr Backend

Event aggregator backend for the Kulturr platform. Collects cultural events from multiple sources, deduplicates them, and stores them in a Supabase database.

## Architecture

```
Sources (UiTdatabank, Ticketmaster)
        ↓
  aggregator.js  ← cron: daily at 02:00
        ↓
  Deduplication (title + venue + date)
        ↓
  Supabase (events table)
        ↓
  Fastify REST API  ← mobile app / frontend
```

## Services

| Service | Purpose | URL |
|---------|---------|-----|
| **GitHub** | Source code — `bdehaes1961/kulturr-backend` | github.com/bdehaes1961/kulturr-backend |
| **Railway** | Hosting + auto-deploy from `main` branch (project: `rare-adventure`) | railway.com |
| **Supabase** | PostgreSQL database (EU region) | supabase.com |

Railway auto-deploys on every push to `main`. No manual deploy step required.

## Environment Variables

Set these in Railway → Project → Variables:

| Variable | Description |
|----------|-------------|
| `UITDATABANK_CLIENT_ID` | OAuth2 client ID for UiTdatabank SAPI v3 |
| `UITDATABANK_CLIENT_SECRET` | OAuth2 client secret for UiTdatabank SAPI v3 |
| `SUPABASE_URL` | Supabase project URL (e.g. `https://xxx.supabase.co`) |
| `SUPABASE_SERVICE_KEY` | Supabase `service_role` JWT — **keep secret, bypasses RLS** |
| `TICKETMASTER_API_KEY` | Ticketmaster Discovery API key |
| `PORT` | Set automatically by Railway |

Copy `.env.example` for local development and fill in the values.

## Data Sources

### UiTdatabank (primary — Belgium)
- API: UiTdatabank SAPI v3 (`search-test.uitdatabank.be`)
- Auth: OAuth2 client credentials → Bearer token (24h, cached)
- Token endpoint: `account-test.uitid.be/realms/uitid/protocol/openid-connect/token`
- Fetches events in Belgium for the next 90 days, paginated (30/page)
- Date format required: `YYYY-MM-DDTHH:mm:ss+HH:MM` (no milliseconds, no `Z`)
- ~6,000+ events per run
- Categories mapped: muziek, theater, dans, expo, festival → overig for the rest

### Ticketmaster
- API: Ticketmaster Discovery API v2
- Auth: API key (query param)
- Covers BE/NL events

## Project Structure

```
kulturr-backend/
├── src/
│   ├── server.js          # Fastify HTTP server + routes
│   ├── aggregator.js      # Orchestrates sources → dedup → upsert
│   ├── db.js              # Supabase client
│   ├── scheduler.js       # node-cron: runs aggregation daily at 02:00
│   └── sources/
│       ├── uitdatabank.js # UiTdatabank OAuth2 + pagination
│       └── ticketmaster.js
├── schema.sql             # Supabase table definition (events)
├── .env.example
└── package.json           # ESM, Node 18+
```

## Database

Table: `events` in Supabase. Upsert key: `(source, external_id)`.

Run `schema.sql` in the Supabase SQL editor to (re)create the table.

Key columns: `source`, `external_id`, `title`, `venue_name`, `city`, `date_start`, `date_end`, `category`, `image_url`, `ticket_url`, `description`, `artists`, `raw`.

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/health` | Liveness check |
| GET | `/events` | All events (supports `?city=`, `?category=`, `?from=`, `?to=`) |
| POST | `/aggregate` | Trigger aggregation manually |

## Local Development

```bash
npm install
cp .env.example .env
# fill in .env
npm start
```

Runs on `http://localhost:3000` by default.

## Transferring to Another Account

Each service is independent:

1. **GitHub**: Transfer repo via Settings → Danger Zone → Transfer ownership.
2. **Railway**: Reconnect to the new GitHub account's fork, or transfer via Railway team settings.
3. **Supabase**: Export data with `pg_dump`, import into a new project; update `SUPABASE_URL` and `SUPABASE_SERVICE_KEY` in Railway.

All credentials live in Railway environment variables — no secrets are hardcoded in the repo.

## Roadmap

- [ ] Switch UiTdatabank from test to production endpoint
- [ ] Push notifications via Firebase (skeleton in `aggregator.js`)
- [ ] Frontend / mobile app consuming the REST API
- [ ] Add more sources (e.g. Eventbrite Belgium)
