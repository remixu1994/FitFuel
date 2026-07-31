begin;

create table if not exists fitfuel.daily_data_import_batch (
  id bigint generated always as identity primary key,
  user_id bigint not null references fitfuel.app_user(id) on delete cascade,
  file_name varchar(255) not null,
  file_format varchar(8) not null check (file_format in ('xlsx', 'csv')),
  file_sha256 char(64) not null,
  status varchar(16) not null default 'preview'
    check (status in ('preview', 'committed', 'rolled_back')),
  row_count integer not null default 0 check (row_count >= 0),
  committed_at timestamptz,
  rolled_back_at timestamptz,
  expires_at timestamptz not null default (now() + interval '24 hours'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists ix_daily_data_import_batch_user_time
  on fitfuel.daily_data_import_batch(user_id, created_at desc);

create table if not exists fitfuel.daily_data_import_row (
  id bigint generated always as identity primary key,
  batch_id bigint not null references fitfuel.daily_data_import_batch(id) on delete cascade,
  record_date date not null,
  imported_calories integer not null check (imported_calories >= 0),
  imported_activity_calories integer not null check (imported_activity_calories >= 0),
  imported_weight_kg numeric(5,2) not null check (imported_weight_kg > 0),
  selected_source varchar(16) check (selected_source in ('meals', 'manual', 'import')),
  use_imported_weight boolean not null default false,
  use_imported_activity boolean not null default false,
  before_snapshot jsonb,
  after_updated_at timestamptz,
  created_at timestamptz not null default now(),
  unique (batch_id, record_date)
);

create index if not exists ix_daily_data_import_row_batch
  on fitfuel.daily_data_import_row(batch_id, record_date);

alter table fitfuel.daily_record
  add column if not exists meal_calories integer not null default 0,
  add column if not exists manual_calories integer,
  add column if not exists imported_calories integer,
  add column if not exists import_batch_id bigint;

update fitfuel.daily_record
set meal_calories = case when calories_source = 'meals' then calories_consumed else meal_calories end,
    manual_calories = case when calories_source = 'manual' then calories_consumed else manual_calories end
where (calories_source = 'meals' and meal_calories = 0)
   or (calories_source = 'manual' and manual_calories is null);

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'daily_record_import_batch_fk'
      and conrelid = 'fitfuel.daily_record'::regclass
  ) then
    alter table fitfuel.daily_record
      add constraint daily_record_import_batch_fk
      foreign key (import_batch_id)
      references fitfuel.daily_data_import_batch(id)
      on delete set null;
  end if;
end $$;

alter table fitfuel.daily_record
  drop constraint if exists daily_record_calories_source_check;

alter table fitfuel.daily_record
  add constraint daily_record_calories_source_check
  check (calories_source in ('meals', 'manual', 'import', 'elevatine'));

alter table fitfuel.daily_record
  drop constraint if exists daily_record_meal_calories_check;
alter table fitfuel.daily_record
  add constraint daily_record_meal_calories_check
  check (meal_calories >= 0);

alter table fitfuel.daily_record
  drop constraint if exists daily_record_manual_calories_check;
alter table fitfuel.daily_record
  add constraint daily_record_manual_calories_check
  check (manual_calories is null or manual_calories >= 0);

alter table fitfuel.daily_record
  drop constraint if exists daily_record_imported_calories_check;
alter table fitfuel.daily_record
  add constraint daily_record_imported_calories_check
  check (imported_calories is null or imported_calories >= 0);

insert into fitfuel.schema_migration(version)
values ('004_daily_data_import_export')
on conflict (version) do nothing;

commit;
