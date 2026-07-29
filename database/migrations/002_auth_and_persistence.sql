begin;

alter table fitfuel.app_user
  add column if not exists role varchar(16) not null default 'user',
  add column if not exists last_login_at timestamptz;

create unique index if not exists ux_app_user_email_lower
  on fitfuel.app_user(lower(email));

create table if not exists fitfuel.auth_session (
  id bigint generated always as identity primary key,
  user_id bigint not null references fitfuel.app_user(id) on delete cascade,
  token_hash char(64) not null unique,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now()
);

create index if not exists ix_auth_session_user on fitfuel.auth_session(user_id);
create index if not exists ix_auth_session_expiry on fitfuel.auth_session(expires_at);

create table if not exists fitfuel.custom_food (
  id bigint generated always as identity primary key,
  user_id bigint not null references fitfuel.app_user(id) on delete cascade,
  name varchar(200) not null,
  brand varchar(120),
  serving_name varchar(60) not null default '100g',
  gram_weight numeric(10,3) not null default 100 check (gram_weight > 0),
  calories numeric(10,2) not null check (calories >= 0),
  protein numeric(10,2) not null default 0 check (protein >= 0),
  carbohydrate numeric(10,2) not null default 0 check (carbohydrate >= 0),
  fat numeric(10,2) not null default 0 check (fat >= 0),
  dietary_fiber numeric(10,2) not null default 0 check (dietary_fiber >= 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index if not exists ix_custom_food_user_name
  on fitfuel.custom_food(user_id, lower(name))
  where deleted_at is null;

alter table fitfuel.daily_record
  add column if not exists deleted_at timestamptz,
  add column if not exists calories_source varchar(16) not null default 'manual';

alter table fitfuel.meal
  add column if not exists deleted_at timestamptz;

alter table fitfuel.meal_item
  add column if not exists custom_food_id bigint references fitfuel.custom_food(id) on delete set null,
  add column if not exists deleted_at timestamptz,
  add column if not exists updated_at timestamptz not null default now();

alter table fitfuel.water_log
  add column if not exists deleted_at timestamptz;

create index if not exists ix_meal_item_custom_food
  on fitfuel.meal_item(custom_food_id);

create or replace view fitfuel.weekly_summary as
select
  user_id,
  date_trunc('week', record_date)::date as week_start,
  count(*) as recorded_days,
  round(avg(calories_consumed)) as average_intake_kcal,
  round(avg(activity_calories)) as average_activity_kcal,
  round(avg(tdee)) as average_tdee_kcal,
  round(avg(calorie_balance)) as average_calorie_balance_kcal,
  round((sum(calorie_balance) / 7700.0)::numeric, 3) as theoretical_weight_change_kg,
  (array_agg(weight_kg order by record_date)
    filter (where weight_kg is not null))[1] as start_weight_kg,
  (array_agg(weight_kg order by record_date desc)
    filter (where weight_kg is not null))[1] as end_weight_kg
from fitfuel.daily_record
where deleted_at is null
group by user_id, date_trunc('week', record_date);

insert into fitfuel.schema_migration(version)
values ('002_auth_and_persistence')
on conflict (version) do nothing;

commit;
