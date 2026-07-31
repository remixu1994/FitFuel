create table if not exists fitfuel.elevatine_import_batch (
  id bigserial primary key,
  user_id bigint not null references fitfuel.app_user(id) on delete cascade,
  status varchar(20) not null default 'uploaded',
  default_year smallint not null,
  image_count integer not null default 0,
  committed_at timestamptz,
  rolled_back_at timestamptz,
  expires_at timestamptz not null default (now() + interval '24 hours'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ck_elevatine_batch_status check
    (status in ('uploaded','parsing','review','committed','failed','rolled_back','expired'))
);

create index if not exists ix_elevatine_batch_user_time
  on fitfuel.elevatine_import_batch(user_id, created_at desc);

create table if not exists fitfuel.elevatine_import_image (
  id bigserial primary key,
  batch_id bigint not null references fitfuel.elevatine_import_batch(id) on delete cascade,
  file_name varchar(255) not null,
  storage_key varchar(500) not null,
  sha256 char(64) not null,
  mime_type varchar(40) not null,
  size_bytes integer not null,
  status varchar(16) not null default 'uploaded',
  image_kind varchar(16) not null default 'unknown',
  parsed_json jsonb,
  confidence numeric(5,4),
  error_message text,
  assigned_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(batch_id, sha256),
  constraint ck_elevatine_image_status check (status in ('uploaded','parsing','parsed','failed','ignored')),
  constraint ck_elevatine_image_kind check (image_kind in ('summary','detail','unknown'))
);

create index if not exists ix_elevatine_image_batch
  on fitfuel.elevatine_import_image(batch_id, id);

create table if not exists fitfuel.elevatine_import_day (
  id bigserial primary key,
  batch_id bigint not null references fitfuel.elevatine_import_batch(id) on delete cascade,
  record_date date not null,
  selected boolean not null default true,
  calories integer not null,
  carbohydrate numeric(8,2),
  protein numeric(8,2),
  fat numeric(8,2),
  calories_goal integer,
  carbohydrate_goal numeric(8,2),
  protein_goal numeric(8,2),
  fat_goal numeric(8,2),
  warnings jsonb,
  before_snapshot jsonb,
  after_updated_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(batch_id, record_date)
);

create index if not exists ix_elevatine_day_batch
  on fitfuel.elevatine_import_day(batch_id, record_date);

create table if not exists fitfuel.elevatine_import_item (
  id bigserial primary key,
  day_id bigint references fitfuel.elevatine_import_day(id) on delete cascade,
  image_id bigint references fitfuel.elevatine_import_image(id) on delete set null,
  meal_label varchar(60) not null default '第 1 餐',
  meal_order smallint not null default 1,
  meal_time varchar(8),
  food_name varchar(200) not null,
  quantity numeric(10,3),
  unit varchar(32),
  calories numeric(10,2) not null,
  carbohydrate numeric(10,2),
  protein numeric(10,2),
  fat numeric(10,2),
  confidence numeric(5,4),
  selected boolean not null default true,
  match_status varchar(16) not null default 'matched',
  dedupe_key varchar(500) not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint ck_elevatine_item_match check (
    match_status in ('matched','ambiguous','unmatched','estimated','estimate_failed')
  )
);

create index if not exists ix_elevatine_item_day on fitfuel.elevatine_import_item(day_id, meal_order, id);
create index if not exists ix_elevatine_item_image on fitfuel.elevatine_import_item(image_id);

alter table fitfuel.daily_record add column if not exists elevatine_calories integer;
alter table fitfuel.daily_record add column if not exists elevatine_carbohydrate numeric(8,2);
alter table fitfuel.daily_record add column if not exists elevatine_protein numeric(8,2);
alter table fitfuel.daily_record add column if not exists elevatine_fat numeric(8,2);
alter table fitfuel.daily_record add column if not exists macro_source varchar(16) not null default 'meals';
alter table fitfuel.daily_record add column if not exists elevatine_batch_id bigint references fitfuel.elevatine_import_batch(id) on delete set null;

alter table fitfuel.meal add column if not exists source varchar(16) not null default 'manual';
alter table fitfuel.meal add column if not exists elevatine_batch_id bigint references fitfuel.elevatine_import_batch(id) on delete set null;

do $$
begin
  if exists (
    select 1 from pg_constraint
    where conrelid = 'fitfuel.daily_record'::regclass
      and conname = 'daily_record_calories_source_check'
  ) then
    alter table fitfuel.daily_record drop constraint daily_record_calories_source_check;
  end if;
exception when undefined_object then null;
end $$;

alter table fitfuel.daily_record
  add constraint daily_record_calories_source_check
  check (calories_source in ('meals','manual','import','elevatine'));

alter table fitfuel.meal_item
  drop constraint if exists meal_item_source_check;
alter table fitfuel.meal_item
  add constraint meal_item_source_check
  check (source in ('database','user','ai','elevatine'));

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'fitfuel.daily_record'::regclass
      and conname = 'daily_record_macro_source_check'
  ) then
    alter table fitfuel.daily_record
      add constraint daily_record_macro_source_check
      check (macro_source in ('meals','elevatine'));
  end if;
end $$;

insert into fitfuel.schema_migration(version)
values ('006_elevatine_image_sync')
on conflict (version) do nothing;
