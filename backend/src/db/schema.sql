-- Supabase / Postgres schema. Run in Supabase SQL editor.
create extension if not exists "pgcrypto";

create table if not exists events(
  id text primary key, name text not null, venue text, starts_at timestamptz, ends_at timestamptz
);
create table if not exists pass_types(
  id text primary key, event_id text references events(id),
  name text not null, price_inr int not null, uses int not null default 1
);
create table if not exists tickets(
  ticket_id text primary key, event_id text not null,
  pass_type text not null, serial_hash text not null, qr_jti text not null,
  holder_name text, holder_contact text,
  status text not null default 'unused' check (status in ('unused','used','voided')),
  uses_remaining int not null default 1, version int not null default 1,
  used_at timestamptz, used_gate_id text, created_at timestamptz default now()
);
-- full signed QR string (lets buyers re-open /t/<id> from any device via link)
alter table tickets add column if not exists qr_string text;
-- multi-night passes (season/VIP): total entries + supervisor re-entry grants.
-- One granted entry per calendar day is enforced via ticket_days below.
alter table tickets add column if not exists max_uses int not null default 1;
alter table tickets add column if not exists reentry_uses int not null default 0;
create table if not exists ticket_days(
  ticket_id text not null, day date not null,
  used_at timestamptz default now(), used_gate_id text, op_id text,
  primary key (ticket_id, day)
);
create index if not exists idx_tickets_status on tickets(status);
create table if not exists gates(
  id text primary key, name text not null, key_hash text not null, active boolean default true
);
create table if not exists scans(
  id bigserial primary key, ticket_id text, gate_id text, result text not null,
  op_id text, scanned_at timestamptz default now()
);
create index if not exists idx_scans_ticket on scans(ticket_id, scanned_at);
create table if not exists audit_log(
  id bigserial primary key, actor text, action text, target_ticket text,
  reason text, at timestamptz default now()
);
create table if not exists operators(
  id text primary key, name text not null, username text unique not null,
  pass_hash text not null, gate_id text references gates(id),
  active boolean not null default true, created_at timestamptz default now()
);
-- Razorpay orders awaiting payment.captured. Tickets are issued ONLY when a
-- row flips pending -> fulfilled, so unpaid orders can never produce QRs.
create table if not exists pending_orders(
  order_id text primary key, pass_id text not null, qty int not null,
  holder_name text, holder_contact text, channel text,
  status text not null default 'pending' check (status in ('pending','fulfilled','failed')),
  issued jsonb, created_at timestamptz default now()
);

-- seed: 1 event + 4 passes (EDIT PRICES HERE) + 4 gates (replace key hashes!)
insert into events(id,name,venue) values('navratri-2026','Raas Rang Navratri Mahotsav','Palanpur')
on conflict do nothing;
insert into pass_types(id,event_id,name,price_inr,uses) values
 ('single','navratri-2026','Single-Day Garba',299,1),
 ('season','navratri-2026','Season Pass · 9 Nights',1499,9),
 ('couple','navratri-2026','Couple Dandiya',499,1),
 ('vip','navratri-2026','VIP Front-Row',2999,9)
on conflict do nothing;
-- gate keys: sha256('dev-gate-1'..'dev-gate-4'); regenerate for prod!
insert into gates(id,name,key_hash) values
 ('gate-north','Gate 1 · North', encode(digest('dev-gate-1','sha256'),'hex')),
 ('gate-south','Gate 2 · South', encode(digest('dev-gate-2','sha256'),'hex')),
 ('gate-east','Gate 3 · East', encode(digest('dev-gate-3','sha256'),'hex')),
 ('gate-vip','Gate 4 · VIP', encode(digest('dev-gate-4','sha256'),'hex'))
on conflict do nothing;
-- gate operators (per-person scanner logins). Demo password for all four is
-- 'scan123' — CHANGE IMMEDIATELY after first deploy via admin API + revoke these.
insert into operators(id,name,username,pass_hash,gate_id) values
 ('op-gate-1','Gate 1 Operator','gate1',crypt('scan123',gen_salt('bf')),'gate-north'),
 ('op-gate-2','Gate 2 Operator','gate2',crypt('scan123',gen_salt('bf')),'gate-south'),
 ('op-gate-3','Gate 3 Operator','gate3',crypt('scan123',gen_salt('bf')),'gate-east'),
 ('op-gate-4','Gate 4 Operator','gate4',crypt('scan123',gen_salt('bf')),'gate-vip')
on conflict do nothing;
