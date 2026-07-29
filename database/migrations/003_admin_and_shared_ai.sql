begin;

alter table fitfuel.app_user
  add column if not exists must_change_password boolean not null default false,
  add column if not exists password_changed_at timestamptz,
  add column if not exists created_by bigint;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'app_user_created_by_fkey'
      and connamespace = 'fitfuel'::regnamespace
  ) then
    alter table fitfuel.app_user
      add constraint app_user_created_by_fkey
      foreign key (created_by) references fitfuel.app_user(id) on delete set null;
  end if;
end $$;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'app_user_role_check'
      and connamespace = 'fitfuel'::regnamespace
  ) then
    alter table fitfuel.app_user
      add constraint app_user_role_check check (role in ('user', 'admin'));
  end if;
end $$;

create table if not exists fitfuel.ai_food_lookup (
  normalized_query varchar(200) primary key,
  food_id integer not null references food_info.food(id) on delete cascade,
  model varchar(80) not null,
  confidence numeric(5,4),
  created_by bigint not null references fitfuel.app_user(id) on delete restrict,
  created_at timestamptz not null default now()
);

create table if not exists fitfuel.food_catalog_audit (
  id bigint generated always as identity primary key,
  food_id integer references food_info.food(id) on delete set null,
  action varchar(32) not null check (action in ('ai_import', 'ai_reuse', 'manual_update')),
  query varchar(200),
  model varchar(80),
  confidence numeric(5,4),
  raw_candidate jsonb,
  final_values jsonb,
  actor_user_id bigint not null references fitfuel.app_user(id) on delete restrict,
  created_at timestamptz not null default now()
);

create index if not exists ix_food_catalog_audit_food
  on fitfuel.food_catalog_audit(food_id, created_at desc);

create table if not exists fitfuel.data_import (
  import_key varchar(80) primary key,
  source_database varchar(80) not null,
  source_snapshot jsonb not null,
  imported_at timestamptz not null default now()
);

insert into fitfuel.schema_migration(version)
values ('003_admin_and_shared_ai')
on conflict (version) do nothing;

commit;
