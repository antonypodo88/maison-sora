-- À coller dans Supabase > SQL Editor > New query, puis cliquer sur "Run"

create table if not exists public.bookings (
  id                uuid primary key default gen_random_uuid(),
  created_at        timestamptz not null default now(),
  service_id        text not null,
  service_name      text not null,
  date              date not null,
  time              time not null,
  customer_name     text not null,
  customer_email    text not null,
  price_chf         integer not null,
  deposit_chf       integer not null,
  status            text not null default 'pending'
                    check (status in ('pending', 'paid', 'cancelled')),
  stripe_session_id text
);

-- Empêche deux réservations actives sur le même créneau
create unique index if not exists bookings_unique_active_slot
  on public.bookings (date, time)
  where status in ('pending', 'paid');

-- Sécurité : la table n'est accessible que par le serveur (clé service_role)
alter table public.bookings enable row level security;
