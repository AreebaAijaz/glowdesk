-- Glowdesk update 002 (20 Nov 2026): advance payments, typed deal items, simpler services
alter table bookings add column if not exists advance_amount numeric(10,0) not null default 0;
alter table bookings add column if not exists advance_method text;
alter table deal_items alter column service_id drop not null;
alter table deal_items add column if not exists label text;
alter table services alter column name set default '';
alter table services alter column duration_min set default 60;
