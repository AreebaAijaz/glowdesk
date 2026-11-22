-- =========================================================
-- Glowdesk database (Phase 1 MVP)
-- Paste this whole file into Supabase > SQL Editor > New query > Run.
-- Safe structure: Brand -> Branch, every row belongs to a branch,
-- and row-level security means a salon only ever sees its own data.
-- =========================================================

create extension if not exists pgcrypto;

-- ---------- Core tenancy ----------
create table if not exists brands (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_at timestamptz not null default now()
);

create table if not exists branches (
  id uuid primary key default gen_random_uuid(),
  brand_id uuid not null references brands(id) on delete cascade,
  name text not null,
  created_at timestamptz not null default now()
);

create table if not exists memberships (
  user_id uuid not null references auth.users(id) on delete cascade,
  brand_id uuid not null references brands(id) on delete cascade,
  branch_id uuid references branches(id) on delete cascade, -- null = all branches (owner)
  role text not null default 'owner' check (role in ('owner','manager','receptionist')),
  created_at timestamptz not null default now(),
  primary key (user_id, brand_id)
);

-- ---------- Staff ----------
create table if not exists staff_levels (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references branches(id) on delete cascade,
  name text not null,
  sort int not null default 0,
  headcount int,           -- used when the salon doesn't list people by name
  created_at timestamptz not null default now()
);

create table if not exists staff (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references branches(id) on delete cascade,
  level_id uuid references staff_levels(id) on delete set null,
  name text not null,
  phone text,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

-- ---------- Services & deals ----------
create table if not exists service_categories (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references branches(id) on delete cascade,
  name text not null,
  sort int not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists services (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references branches(id) on delete cascade,
  category_id uuid not null references service_categories(id) on delete cascade,
  name text not null,                    -- e.g. "Senior", "Junior", or "Standard"
  level_id uuid references staff_levels(id) on delete set null, -- suggested staff level
  price numeric(10,0) not null default 0,
  duration_min int not null default 30,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists deals (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references branches(id) on delete cascade,
  name text not null,
  price numeric(10,0) not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists deal_items (
  id uuid primary key default gen_random_uuid(),
  deal_id uuid not null references deals(id) on delete cascade,
  branch_id uuid not null references branches(id) on delete cascade,
  service_id uuid not null references services(id) on delete cascade
);

-- ---------- Clients ----------
create table if not exists clients (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references branches(id) on delete cascade,
  name text not null,
  phone text,                            -- international format, e.g. 923001234567 (walk-ins may skip)
  birthday date,
  notes text,
  created_at timestamptz not null default now(),
  unique (branch_id, phone)
);

-- ---------- Bookings ----------
create table if not exists bookings (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references branches(id) on delete cascade,
  client_id uuid not null references clients(id) on delete restrict,
  status text not null default 'booked' check (status in ('booked','completed','cancelled','no_show')),
  is_walk_in boolean not null default false,
  notes text,
  confirmation_sent_at timestamptz,
  paid_amount numeric(10,0),
  payment_method text check (payment_method in ('cash','card','jazzcash','easypaisa','bank','other')),
  paid_at timestamptz,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now()
);

create table if not exists booking_items (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references bookings(id) on delete cascade,
  branch_id uuid not null references branches(id) on delete cascade,
  service_id uuid references services(id) on delete set null,
  deal_id uuid references deals(id) on delete set null,
  staff_id uuid references staff(id) on delete set null,   -- a named person, or
  level_id uuid references staff_levels(id) on delete set null, -- "any Junior"
  booked_for text,
  label text not null,                   -- service name at time of booking
  start_at timestamptz not null,
  duration_min int not null default 30,
  price numeric(10,0) not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists booking_items_branch_start on booking_items (branch_id, start_at);
create index if not exists bookings_branch_paid on bookings (branch_id, paid_at);
create index if not exists clients_branch_name on clients (branch_id, name);

-- =========================================================
-- Security helpers
-- =========================================================
create or replace function my_branch_ids()
returns setof uuid
language sql stable security definer set search_path = public as $$
  select b.id from branches b
  join memberships m on m.brand_id = b.brand_id
  where m.user_id = auth.uid()
    and (m.branch_id is null or m.branch_id = b.id);
$$;

create or replace function my_brand_ids()
returns setof uuid
language sql stable security definer set search_path = public as $$
  select brand_id from memberships where user_id = auth.uid();
$$;

-- First-time setup: creates the salon, its first branch, the owner membership
-- and default staff levels. Called from the app's setup screen.
create or replace function create_salon(salon_name text, branch_name text default 'Main')
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_brand uuid;
  v_branch uuid;
begin
  if auth.uid() is null then
    raise exception 'Not signed in';
  end if;
  if exists (select 1 from memberships where user_id = auth.uid()) then
    raise exception 'This account already has a salon';
  end if;

  insert into brands (name) values (salon_name) returning id into v_brand;
  insert into branches (brand_id, name) values (v_brand, branch_name) returning id into v_branch;
  insert into memberships (user_id, brand_id, branch_id, role) values (auth.uid(), v_brand, null, 'owner');

  insert into staff_levels (branch_id, name, sort) values
    (v_branch, 'Owner', 1), (v_branch, 'Senior', 2), (v_branch, 'Middle', 3), (v_branch, 'Junior', 4);

  return v_branch;
end;
$$;

grant execute on function create_salon(text, text) to authenticated;
grant execute on function my_branch_ids() to authenticated;
grant execute on function my_brand_ids() to authenticated;

-- =========================================================
-- Row-level security
-- =========================================================
alter table brands enable row level security;
alter table branches enable row level security;
alter table memberships enable row level security;
alter table staff_levels enable row level security;
alter table staff enable row level security;
alter table service_categories enable row level security;
alter table services enable row level security;
alter table deals enable row level security;
alter table deal_items enable row level security;
alter table clients enable row level security;
alter table bookings enable row level security;
alter table booking_items enable row level security;

drop policy if exists "own brands" on brands;
create policy "own brands" on brands for select using (id in (select my_brand_ids()));
drop policy if exists "owner updates brand" on brands;
create policy "owner updates brand" on brands for update using (id in (select my_brand_ids()));

drop policy if exists "own branches" on branches;
create policy "own branches" on branches for select using (id in (select my_branch_ids()));
drop policy if exists "update own branches" on branches;
create policy "update own branches" on branches for update using (id in (select my_branch_ids()));

drop policy if exists "own memberships" on memberships;
create policy "own memberships" on memberships for select using (user_id = auth.uid());

-- Same rule for every branch-owned table: full access only to your own branches.
do $$
declare t text;
begin
  foreach t in array array['staff_levels','staff','service_categories','services','deals','deal_items','clients','bookings','booking_items']
  loop
    execute format('drop policy if exists "branch access" on %I', t);
    execute format(
      'create policy "branch access" on %I for all using (branch_id in (select my_branch_ids())) with check (branch_id in (select my_branch_ids()))',
      t);
  end loop;
end $$;

-- Make sure signed-in users can reach the tables (row-level security above still limits each salon to its own rows).
grant usage on schema public to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
-- Glowdesk update 002 (20 Nov 2026): advance payments, typed deal items, simpler services
alter table bookings add column if not exists advance_amount numeric(10,0) not null default 0;
alter table bookings add column if not exists advance_method text;
alter table deal_items alter column service_id drop not null;
alter table deal_items add column if not exists label text;
alter table services alter column name set default '';
alter table services alter column duration_min set default 60;
-- Glowdesk update 003: service groups (e.g. Makeup > Bridal Makeup, Party Makeup)
create table if not exists service_groups (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null references branches(id) on delete cascade,
  name text not null,
  sort int not null default 0,
  created_at timestamptz not null default now()
);
alter table service_categories add column if not exists group_id uuid references service_groups(id) on delete set null;
alter table service_groups enable row level security;
drop policy if exists "branch access" on service_groups;
create policy "branch access" on service_groups for all using (branch_id in (select my_branch_ids())) with check (branch_id in (select my_branch_ids()));
grant select, insert, update, delete on service_groups to authenticated;
notify pgrst, 'reload schema';
-- =========================================================
-- Glowdesk update 004 (22 Nov 2026): money safety + stricter salon separation
-- - All money changes go through checked functions (no direct edits, no deletes)
-- - Rows can't point at another salon's records
-- - No negative amounts; discounts recorded when a client pays less than due
-- - One salon per account
-- =========================================================

-- ---------- Amount rules ----------
alter table bookings add column if not exists discount_amount numeric(10,0) not null default 0;
alter table bookings drop constraint if exists bookings_amounts_ok;
alter table bookings add constraint bookings_amounts_ok check (advance_amount >= 0 and coalesce(paid_amount, 0) >= 0 and discount_amount >= 0);
alter table booking_items drop constraint if exists booking_items_price_ok;
alter table booking_items add constraint booking_items_price_ok check (price >= 0);
alter table services drop constraint if exists services_price_ok;
alter table services add constraint services_price_ok check (price >= 0);
alter table deals drop constraint if exists deals_price_ok;
alter table deals add constraint deals_price_ok check (price >= 0);

-- ---------- One salon per account ----------
create unique index if not exists memberships_one_per_user on memberships (user_id);

-- ---------- Same-salon links ----------
create or replace function enforce_same_branch()
returns trigger language plpgsql set search_path = public as $$
begin
  if tg_table_name = 'bookings' then
    if not exists (select 1 from clients where id = new.client_id and branch_id = new.branch_id) then
      raise exception 'Client belongs to another salon';
    end if;
  elsif tg_table_name = 'booking_items' then
    if not exists (select 1 from bookings where id = new.booking_id and branch_id = new.branch_id) then
      raise exception 'Booking belongs to another salon';
    end if;
    if new.service_id is not null and not exists (select 1 from services where id = new.service_id and branch_id = new.branch_id) then
      raise exception 'Service belongs to another salon';
    end if;
    if new.deal_id is not null and not exists (select 1 from deals where id = new.deal_id and branch_id = new.branch_id) then
      raise exception 'Deal belongs to another salon';
    end if;
    if new.staff_id is not null and not exists (select 1 from staff where id = new.staff_id and branch_id = new.branch_id) then
      raise exception 'Staff belongs to another salon';
    end if;
    if new.level_id is not null and not exists (select 1 from staff_levels where id = new.level_id and branch_id = new.branch_id) then
      raise exception 'Staff level belongs to another salon';
    end if;
  elsif tg_table_name = 'services' then
    if not exists (select 1 from service_categories where id = new.category_id and branch_id = new.branch_id) then
      raise exception 'Service belongs to another salon';
    end if;
    if new.level_id is not null and not exists (select 1 from staff_levels where id = new.level_id and branch_id = new.branch_id) then
      raise exception 'Staff level belongs to another salon';
    end if;
  elsif tg_table_name = 'service_categories' then
    if new.group_id is not null and not exists (select 1 from service_groups where id = new.group_id and branch_id = new.branch_id) then
      raise exception 'Group belongs to another salon';
    end if;
  elsif tg_table_name = 'staff' then
    if new.level_id is not null and not exists (select 1 from staff_levels where id = new.level_id and branch_id = new.branch_id) then
      raise exception 'Staff level belongs to another salon';
    end if;
  elsif tg_table_name = 'deal_items' then
    if not exists (select 1 from deals where id = new.deal_id and branch_id = new.branch_id) then
      raise exception 'Deal belongs to another salon';
    end if;
    if new.service_id is not null and not exists (select 1 from services where id = new.service_id and branch_id = new.branch_id) then
      raise exception 'Service belongs to another salon';
    end if;
  end if;
  return new;
end;
$$;

do $$
declare t text;
begin
  foreach t in array array['bookings','booking_items','services','service_categories','staff','deal_items']
  loop
    execute format('drop trigger if exists same_branch on %I', t);
    execute format('create trigger same_branch before insert or update on %I for each row execute function enforce_same_branch()', t);
  end loop;
end $$;

-- ---------- Brands/branches: rename only, never move ----------
drop policy if exists "owner updates brand" on brands;
create policy "owner updates brand" on brands for update using (id in (select my_brand_ids())) with check (id in (select my_brand_ids()));
drop policy if exists "update own branches" on branches;
create policy "update own branches" on branches for update using (id in (select my_branch_ids())) with check (id in (select my_branch_ids()) and brand_id in (select my_brand_ids()));
revoke update on brands, branches from authenticated;
grant update (name) on brands, branches to authenticated;

-- ---------- Bookings: money only changes through these functions ----------
revoke insert, update, delete on bookings, booking_items from authenticated, anon;
grant select on bookings, booking_items to authenticated;
grant update (notes, confirmation_sent_at) on bookings to authenticated;

-- Create a booking with its services in one step (all or nothing)
create or replace function create_booking(p jsonb)
returns uuid language plpgsql security definer set search_path = public as $$
declare
  v_branch uuid := (p->>'branch_id')::uuid;
  v_client uuid := nullif(p->>'client_id', '')::uuid;
  v_phone text := nullif(p->>'phone', '');
  v_booking uuid;
  v_total numeric := 0;
  v_adv numeric := round(coalesce((p->>'advance_amount')::numeric, 0));
  it jsonb;
begin
  if v_branch is null or v_branch not in (select my_branch_ids()) then
    raise exception 'Not allowed';
  end if;
  if jsonb_array_length(coalesce(p->'items', '[]'::jsonb)) = 0 then
    raise exception 'Add at least one service';
  end if;
  for it in select * from jsonb_array_elements(p->'items') loop
    if round(coalesce((it->>'price')::numeric, 0)) < 0 then raise exception 'Prices can''t be negative'; end if;
    v_total := v_total + round(coalesce((it->>'price')::numeric, 0));
  end loop;
  if v_adv < 0 or v_adv > v_total then
    raise exception 'Advance must be between 0 and the total';
  end if;

  if v_client is not null then
    if not exists (select 1 from clients where id = v_client and branch_id = v_branch) then raise exception 'Client not found'; end if;
  else
    if coalesce(trim(p->>'name'), '') = '' then raise exception 'Client name is required'; end if;
    if v_phone is not null then
      select id into v_client from clients where branch_id = v_branch and phone = v_phone;
    end if;
    if v_client is null then
      insert into clients (branch_id, name, phone) values (v_branch, trim(p->>'name'), v_phone) returning id into v_client;
    end if;
  end if;

  insert into bookings (branch_id, client_id, is_walk_in, notes, advance_amount, advance_method, created_by)
  values (v_branch, v_client, coalesce((p->>'is_walk_in')::boolean, false), nullif(trim(p->>'notes'), ''), v_adv,
          case when v_adv > 0 then coalesce(nullif(p->>'advance_method', ''), 'cash') end, auth.uid())
  returning id into v_booking;

  insert into booking_items (booking_id, branch_id, service_id, deal_id, staff_id, level_id, label, start_at, duration_min, price)
  select v_booking, v_branch,
         nullif(i->>'service_id', '')::uuid, nullif(i->>'deal_id', '')::uuid,
         nullif(i->>'staff_id', '')::uuid, nullif(i->>'level_id', '')::uuid,
         coalesce(nullif(i->>'label', ''), 'Service'), (i->>'start_at')::timestamptz,
         coalesce((i->>'duration_min')::int, 60), round(coalesce((i->>'price')::numeric, 0))
  from jsonb_array_elements(p->'items') i;

  return v_booking;
end;
$$;

-- Mark done and collect the balance. Paying less than due records the gap as a discount.
create or replace function complete_booking(p_booking uuid, p_amount numeric, p_method text)
returns void language plpgsql security definer set search_path = public as $$
declare
  v bookings%rowtype;
  v_total numeric;
  v_due numeric;
  v_amount numeric := round(coalesce(p_amount, 0));
begin
  select * into v from bookings where id = p_booking for update;
  if not found or v.branch_id not in (select my_branch_ids()) then raise exception 'Booking not found'; end if;
  if v.status <> 'booked' then raise exception 'Only open bookings can be marked done'; end if;
  if v_amount < 0 then raise exception 'Amount can''t be negative'; end if;
  select coalesce(sum(price), 0) into v_total from booking_items where booking_id = p_booking;
  v_due := greatest(v_total - v.advance_amount, 0);
  update bookings set
    status = 'completed',
    paid_amount = v_amount,
    payment_method = case when v_amount > 0 then coalesce(nullif(p_method, ''), 'cash') end,
    paid_at = now(),
    discount_amount = greatest(v_due - v_amount, 0)
  where id = p_booking;
end;
$$;

-- Undo "Done" (only on the same day it was marked, so a counted cash drawer is never changed)
create or replace function undo_complete(p_booking uuid)
returns void language plpgsql security definer set search_path = public as $$
declare v bookings%rowtype;
begin
  select * into v from bookings where id = p_booking for update;
  if not found or v.branch_id not in (select my_branch_ids()) then raise exception 'Booking not found'; end if;
  if v.status <> 'completed' then raise exception 'This booking is not marked done'; end if;
  if (v.paid_at at time zone 'Asia/Karachi')::date <> (now() at time zone 'Asia/Karachi')::date then
    raise exception 'Done can only be undone on the same day';
  end if;
  update bookings set status = 'booked', paid_amount = null, payment_method = null, paid_at = null, discount_amount = 0 where id = p_booking;
end;
$$;

-- Cancel, no-show, or reopen a cancelled/no-show booking. The advance always stays.
create or replace function set_booking_status(p_booking uuid, p_status text)
returns void language plpgsql security definer set search_path = public as $$
declare v bookings%rowtype;
begin
  select * into v from bookings where id = p_booking for update;
  if not found or v.branch_id not in (select my_branch_ids()) then raise exception 'Booking not found'; end if;
  if p_status in ('cancelled', 'no_show') and v.status = 'booked' then
    update bookings set status = p_status where id = p_booking;
  elsif p_status = 'booked' and v.status in ('cancelled', 'no_show') then
    update bookings set status = 'booked' where id = p_booking;
  else
    raise exception 'That change isn''t allowed';
  end if;
end;
$$;

-- Move a booking (and all its services) to a new date & time; a no-show becomes open again
create or replace function reschedule_booking(p_booking uuid, p_start timestamptz)
returns void language plpgsql security definer set search_path = public as $$
declare v bookings%rowtype; v_first timestamptz;
begin
  select * into v from bookings where id = p_booking for update;
  if not found or v.branch_id not in (select my_branch_ids()) then raise exception 'Booking not found'; end if;
  if v.status not in ('booked', 'no_show') then raise exception 'Only open or no-show bookings can be moved'; end if;
  select min(start_at) into v_first from booking_items where booking_id = p_booking;
  update booking_items set start_at = start_at + (p_start - v_first) where booking_id = p_booking;
  update bookings set status = 'booked', confirmation_sent_at = null where id = p_booking;
end;
$$;

revoke all on function create_booking(jsonb), complete_booking(uuid, numeric, text), undo_complete(uuid), set_booking_status(uuid, text), reschedule_booking(uuid, timestamptz) from public, anon;
grant execute on function create_booking(jsonb), complete_booking(uuid, numeric, text), undo_complete(uuid), set_booking_status(uuid, text), reschedule_booking(uuid, timestamptz) to authenticated;

-- Lock down create_salon against two salons for one account
create or replace function create_salon(salon_name text, branch_name text default 'Main')
returns uuid
language plpgsql security definer set search_path = public as $$
declare
  v_brand uuid;
  v_branch uuid;
begin
  if auth.uid() is null then raise exception 'Not signed in'; end if;
  perform pg_advisory_xact_lock(hashtext(auth.uid()::text));
  if exists (select 1 from memberships where user_id = auth.uid()) then
    raise exception 'This account already has a salon';
  end if;
  insert into brands (name) values (salon_name) returning id into v_brand;
  insert into branches (brand_id, name) values (v_brand, branch_name) returning id into v_branch;
  insert into memberships (user_id, brand_id, branch_id, role) values (auth.uid(), v_brand, null, 'owner');
  insert into staff_levels (branch_id, name, sort) values
    (v_branch, 'Owner', 1), (v_branch, 'Senior', 2), (v_branch, 'Middle', 3), (v_branch, 'Junior', 4);
  return v_branch;
end;
$$;
revoke all on function create_salon(text, text) from public, anon;
grant execute on function create_salon(text, text) to authenticated;

notify pgrst, 'reload schema';
