-- Glowdesk security test: three salons must never see or change each other's data.
-- Everything runs inside one block that ends with an error on purpose, so ALL changes
-- (including the 3 temporary test users) are rolled back. The error message is the report.
do $$
declare
  ua uuid := gen_random_uuid();
  ub uuid := gen_random_uuid();
  uc uuid := gen_random_uuid();
  bra uuid; brb uuid; brc uuid; brand_a uuid;
  ca uuid; bka uuid; n int;
  res text := '';
  passed int := 0; failed int := 0;
begin
  insert into auth.users (id, instance_id, aud, role, email, created_at, updated_at, raw_app_meta_data, raw_user_meta_data)
  values (ua, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'rls-a@test.local', now(), now(), '{}', '{}'),
         (ub, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'rls-b@test.local', now(), now(), '{}', '{}'),
         (uc, '00000000-0000-0000-0000-000000000000', 'authenticated', 'authenticated', 'rls-c@test.local', now(), now(), '{}', '{}');

  -- ===== Salon A sets up and books =====
  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', ua, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', ua::text, true);
  bra := create_salon('Salon A');
  select brand_id into brand_a from branches where id = bra;
  insert into clients (branch_id, name, phone) values (bra, 'Client of A', '923001111111') returning id into ca;
  bka := create_booking(jsonb_build_object('branch_id', bra, 'client_id', ca, 'advance_amount', 40000, 'advance_method', 'cash',
    'items', jsonb_build_array(jsonb_build_object('label', 'Bridal Makeup', 'start_at', now() + interval '2 days', 'price', 75000))));

  -- ===== Money protections (Salon A on its own data) =====
  begin
    update bookings set paid_amount = 999999 where id = bka;
    failed := failed + 1; res := res || ' [FAIL direct edit of payment allowed]';
  exception when others then passed := passed + 1; end;
  begin
    delete from bookings where id = bka;
    failed := failed + 1; res := res || ' [FAIL booking could be deleted]';
  exception when others then passed := passed + 1; end;
  begin
    update booking_items set price = 1 where booking_id = bka;
    failed := failed + 1; res := res || ' [FAIL price edited after booking]';
  exception when others then passed := passed + 1; end;
  begin
    perform create_booking(jsonb_build_object('branch_id', bra, 'client_id', ca, 'advance_amount', 5000,
      'items', jsonb_build_array(jsonb_build_object('label', 'Cut', 'start_at', now(), 'price', 3000))));
    failed := failed + 1; res := res || ' [FAIL advance above total accepted]';
  exception when others then passed := passed + 1; end;
  begin
    perform create_booking(jsonb_build_object('branch_id', bra, 'client_id', ca,
      'items', jsonb_build_array(jsonb_build_object('label', 'Cut', 'start_at', now(), 'price', -100))));
    failed := failed + 1; res := res || ' [FAIL negative price accepted]';
  exception when others then passed := passed + 1; end;
  begin
    perform complete_booking(bka, -5, 'cash');
    failed := failed + 1; res := res || ' [FAIL negative payment accepted]';
  exception when others then passed := passed + 1; end;
  update bookings set notes = 'Prefers Hira' where id = bka;  -- allowed field
  get diagnostics n = row_count;
  if n = 1 then passed := passed + 1; else failed := failed + 1; res := res || ' [FAIL notes edit blocked]'; end if;

  -- Pay less than due → discount recorded, booking closed
  perform complete_booking(bka, 30000, 'jazzcash');
  select discount_amount into n from bookings where id = bka;
  if n = 5000 then passed := passed + 1; else failed := failed + 1; res := res || ' [FAIL discount=' || n || ' expected 5000]'; end if;
  begin
    perform complete_booking(bka, 30000, 'cash');
    failed := failed + 1; res := res || ' [FAIL booking marked done twice]';
  exception when others then passed := passed + 1; end;
  begin
    perform set_booking_status(bka, 'booked');
    failed := failed + 1; res := res || ' [FAIL completed booking reopened, payment at risk]';
  exception when others then passed := passed + 1; end;
  -- Undo done (same day) clears the visit payment but keeps the advance
  perform undo_complete(bka);
  select advance_amount into n from bookings where id = bka;
  if n = 40000 and (select status from bookings where id = bka) = 'booked' and (select paid_amount from bookings where id = bka) is null
  then passed := passed + 1; else failed := failed + 1; res := res || ' [FAIL undo done]'; end if;
  -- No-show keeps advance; reschedule makes it open again at the new time
  perform set_booking_status(bka, 'no_show');
  perform reschedule_booking(bka, now() + interval '5 days');
  if (select status from bookings where id = bka) = 'booked' and (select advance_amount from bookings where id = bka) = 40000
     and (select min(start_at) from booking_items where booking_id = bka) > now() + interval '4 days'
  then passed := passed + 1; else failed := failed + 1; res := res || ' [FAIL no-show reschedule]'; end if;
  -- Cancel keeps advance; cancelled can't be rescheduled directly
  perform set_booking_status(bka, 'cancelled');
  begin
    perform reschedule_booking(bka, now() + interval '6 days');
    failed := failed + 1; res := res || ' [FAIL cancelled booking moved]';
  exception when others then passed := passed + 1; end;
  perform set_booking_status(bka, 'booked');  -- reopen for the tests below
  if (select advance_amount from bookings where id = bka) = 40000 then passed := passed + 1; else failed := failed + 1; res := res || ' [FAIL advance lost on cancel/reopen]'; end if;
  select count(*) into n from clients;
  if n = 1 then passed := passed + 1; else failed := failed + 1; res := res || ' [FAIL A sees own client count=' || n || ']'; end if;

  -- ===== Salon B =====
  perform set_config('request.jwt.claims', json_build_object('sub', ub, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', ub::text, true);
  brb := create_salon('Salon B');

  select count(*) into n from clients;        if n = 0 then passed := passed + 1; else failed := failed + 1; res := res || ' [FAIL B reads A clients=' || n || ']'; end if;
  select count(*) into n from bookings;       if n = 0 then passed := passed + 1; else failed := failed + 1; res := res || ' [FAIL B reads A bookings=' || n || ']'; end if;
  select count(*) into n from booking_items;  if n = 0 then passed := passed + 1; else failed := failed + 1; res := res || ' [FAIL B reads A items=' || n || ']'; end if;
  select count(*) into n from brands;         if n = 1 then passed := passed + 1; else failed := failed + 1; res := res || ' [FAIL B sees brands=' || n || ']'; end if;
  select count(*) into n from branches;       if n = 1 then passed := passed + 1; else failed := failed + 1; res := res || ' [FAIL B sees branches=' || n || ']'; end if;
  select count(*) into n from memberships;    if n = 1 then passed := passed + 1; else failed := failed + 1; res := res || ' [FAIL B sees memberships=' || n || ']'; end if;
  select count(*) into n from staff_levels;   if n = 4 then passed := passed + 1; else failed := failed + 1; res := res || ' [FAIL B sees levels=' || n || ']'; end if;

  -- B tries to write into A's salon
  begin
    insert into clients (branch_id, name, phone) values (bra, 'Injected', '923009999999');
    failed := failed + 1; res := res || ' [FAIL B inserted client into A]';
  exception when others then passed := passed + 1; end;

  begin
    update bookings set notes = 'hacked' where id = bka;
    get diagnostics n = row_count;
    if n = 0 then passed := passed + 1; else failed := failed + 1; res := res || ' [FAIL B edited A booking]'; end if;
  exception when others then passed := passed + 1; end;
  begin
    perform complete_booking(bka, 0, 'cash');
    failed := failed + 1; res := res || ' [FAIL B closed A booking]';
  exception when others then passed := passed + 1; end;
  begin
    perform set_booking_status(bka, 'cancelled');
    failed := failed + 1; res := res || ' [FAIL B cancelled A booking]';
  exception when others then passed := passed + 1; end;
  begin
    perform create_booking(jsonb_build_object('branch_id', bra, 'name', 'X', 'items', jsonb_build_array(jsonb_build_object('label', 'X', 'start_at', now(), 'price', 1))));
    failed := failed + 1; res := res || ' [FAIL B created booking in A]';
  exception when others then passed := passed + 1; end;

  delete from clients where id = ca;
  get diagnostics n = row_count;
  if n = 0 then passed := passed + 1; else failed := failed + 1; res := res || ' [FAIL B deleted A client]'; end if;

  update brands set name = 'Hacked' where id = brand_a;
  get diagnostics n = row_count;
  if n = 0 then passed := passed + 1; else failed := failed + 1; res := res || ' [FAIL B renamed A brand]'; end if;

  begin
    insert into memberships (user_id, brand_id, role) values (ub, brand_a, 'owner');
    failed := failed + 1; res := res || ' [FAIL B joined A brand]';
  exception when others then passed := passed + 1; end;

  begin
    insert into branches (brand_id, name) values (brand_a, 'Sneaky');
    failed := failed + 1; res := res || ' [FAIL B added branch to A]';
  exception when others then passed := passed + 1; end;

  -- B points its own booking at A's client (cross-salon link)
  begin
    perform create_booking(jsonb_build_object('branch_id', brb, 'client_id', ca, 'items', jsonb_build_array(jsonb_build_object('label', 'X', 'start_at', now(), 'price', 1))));
    failed := failed + 1; res := res || ' [FAIL B booking linked to A client]';
  exception when others then passed := passed + 1; end;

  -- B adds an item to A's booking from its own branch
  begin
    insert into booking_items (booking_id, branch_id, label, start_at, price) values (bka, brb, 'Extra', now(), 1);
    failed := failed + 1; res := res || ' [FAIL B added item to A booking]';
  exception when others then passed := passed + 1; end;

  begin
    perform create_salon('Second salon for B');
    failed := failed + 1; res := res || ' [FAIL B created 2nd salon]';
  exception when others then passed := passed + 1; end;

  -- Same phone number can exist in two different salons
  begin
    insert into clients (branch_id, name, phone) values (brb, 'Same phone in B', '923001111111');
    passed := passed + 1;
  exception when others then failed := failed + 1; res := res || ' [FAIL same phone blocked across salons]'; end;

  -- Same phone twice in one salon is blocked
  begin
    insert into clients (branch_id, name, phone) values (brb, 'Duplicate', '923001111111');
    failed := failed + 1; res := res || ' [FAIL duplicate phone in same salon]';
  exception when others then passed := passed + 1; end;

  -- ===== Salon C sees nothing of A or B =====
  perform set_config('request.jwt.claims', json_build_object('sub', uc, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', uc::text, true);
  brc := create_salon('Salon C');
  select count(*) into n from clients;  if n = 0 then passed := passed + 1; else failed := failed + 1; res := res || ' [FAIL C reads clients=' || n || ']'; end if;
  select count(*) into n from bookings; if n = 0 then passed := passed + 1; else failed := failed + 1; res := res || ' [FAIL C reads bookings=' || n || ']'; end if;

  -- ===== Not logged in (anon) =====
  execute 'set local role anon';
  perform set_config('request.jwt.claims', json_build_object('role', 'anon')::text, true);
  perform set_config('request.jwt.claim.sub', '', true);
  begin
    select count(*) into n from clients;
    if n = 0 then passed := passed + 1; else failed := failed + 1; res := res || ' [FAIL anon reads clients=' || n || ']'; end if;
  exception when others then passed := passed + 1; end;
  begin
    select count(*) into n from bookings;
    if n = 0 then passed := passed + 1; else failed := failed + 1; res := res || ' [FAIL anon reads bookings=' || n || ']'; end if;
  exception when others then passed := passed + 1; end;
  begin
    perform create_salon('Anon salon');
    failed := failed + 1; res := res || ' [FAIL anon created salon]';
  exception when others then passed := passed + 1; end;

  -- Back as A: data untouched
  execute 'set local role authenticated';
  perform set_config('request.jwt.claims', json_build_object('sub', ua, 'role', 'authenticated')::text, true);
  perform set_config('request.jwt.claim.sub', ua::text, true);
  select advance_amount into n from bookings where id = bka;
  if n = 40000 then passed := passed + 1; else failed := failed + 1; res := res || ' [FAIL A advance changed to ' || n || ']'; end if;
  select count(*) into n from booking_items where booking_id = bka;
  if n = 1 then passed := passed + 1; else failed := failed + 1; res := res || ' [FAIL A booking items=' || n || ']'; end if;

  raise exception 'GLOWDESK SECURITY TEST: % passed, % failed.% (all test data rolled back)', passed, failed, res;
end $$;
