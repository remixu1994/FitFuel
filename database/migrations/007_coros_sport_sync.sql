begin;

create schema if not exists sport;

create table if not exists sport.coros_sync_batch (
  id bigserial primary key,
  user_id bigint not null references fitfuel.app_user(id) on delete cascade,
  start_date date not null,
  end_date date not null,
  status varchar(16) not null default 'fetching',
  activity_count integer not null default 0,
  day_count integer not null default 0,
  error_message text,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  constraint ck_coros_sync_batch_status
    check (status in ('fetching','committed','failed')),
  constraint ck_coros_sync_batch_range check (end_date >= start_date)
);

create index if not exists ix_coros_sync_batch_user_time
  on sport.coros_sync_batch(user_id, created_at desc);

create table if not exists sport.coros_activity (
  id bigserial primary key,
  user_id bigint not null references fitfuel.app_user(id) on delete cascade,
  sync_batch_id bigint references sport.coros_sync_batch(id) on delete set null,
  external_id varchar(100) not null,
  activity_date date not null,
  activity_name varchar(200),
  sport_type integer,
  mode integer,
  start_time timestamptz,
  end_time timestamptz,
  duration_seconds integer,
  calorie_raw bigint not null default 0,
  calories_kcal numeric(10,3) not null default 0,
  raw_payload jsonb not null,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, external_id),
  constraint ck_coros_activity_calories check (calorie_raw >= 0 and calories_kcal >= 0)
);

create index if not exists ix_coros_activity_user_date
  on sport.coros_activity(user_id, activity_date);

create table if not exists sport.coros_daily_summary (
  id bigserial primary key,
  user_id bigint not null references fitfuel.app_user(id) on delete cascade,
  sync_batch_id bigint references sport.coros_sync_batch(id) on delete set null,
  summary_date date not null,
  activity_count integer not null default 0,
  calorie_raw bigint not null default 0,
  calories_kcal numeric(10,2) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, summary_date),
  constraint ck_coros_daily_summary_values
    check (activity_count >= 0 and calorie_raw >= 0 and calories_kcal >= 0)
);

create index if not exists ix_coros_daily_summary_user_date
  on sport.coros_daily_summary(user_id, summary_date desc);

alter table fitfuel.daily_record
  add column if not exists coros_activity_calories numeric(10,2);

alter table fitfuel.daily_record
  add column if not exists activity_source varchar(16) not null default 'manual';

update fitfuel.daily_record
set activity_source = case
  when import_batch_id is not null and activity_calories > 0 then 'import'
  else 'manual'
end
where activity_source = 'manual';

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'ck_daily_record_activity_source'
      and conrelid = 'fitfuel.daily_record'::regclass
  ) then
    alter table fitfuel.daily_record
      add constraint ck_daily_record_activity_source
      check (activity_source in ('manual','import','coros'));
  end if;
end $$;

insert into fitfuel.schema_migration(version)
values ('007_coros_sport_sync')
on conflict (version) do nothing;

commit;
