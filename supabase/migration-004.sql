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
