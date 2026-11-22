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
