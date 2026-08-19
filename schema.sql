-- Plak dit in de Supabase SQL editor en voer uit

create table events (
  id              uuid primary key default gen_random_uuid(),
  external_id     text not null,
  source          text not null,
  title           text not null,
  venue_name      text,
  city            text,
  date_start      timestamptz,
  date_end        timestamptz,
  price_min       numeric(8,2),
  price_max       numeric(8,2),
  category        text,
  image_url       text,
  ticket_url      text,
  description     text,
  artists         text[]  default '{}',
  raw             jsonb,
  created_at      timestamptz default now(),
  updated_at      timestamptz default now(),
  unique (source, external_id)
);

create index on events (city, date_start);
create index on events (category);
create index on events (date_start);

create table users (
  id              uuid primary key default gen_random_uuid(),
  device_token    text,
  cities          text[]  default '{}',
  categories      text[]  default '{}',
  artists         text[]  default '{}',
  created_at      timestamptz default now()
);

create table notifications (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid references users(id) on delete cascade,
  event_id    uuid references events(id) on delete cascade,
  sent_at     timestamptz default now(),
  action      text,
  unique (user_id, event_id)
);

create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger events_updated_at
  before update on events
  for each row execute function set_updated_at();


-- Watchlist: gebruikers die een melding willen als tickets beschikbaar komen
create table watchlist (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid references users(id) on delete cascade,
  event_id        uuid references events(id) on delete cascade,
  notify_on_sale  boolean default true,   -- ping zodra ticket_url beschikbaar is
  notify_reminder boolean default false,  -- ping 1 dag voor het event
  notified_at     timestamptz,            -- wanneer on-sale notificatie verstuurd is
  created_at      timestamptz default now(),
  unique (user_id, event_id)
);

create index on watchlist (event_id, notify_on_sale, notified_at);
