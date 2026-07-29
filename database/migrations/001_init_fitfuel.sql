begin;

create schema if not exists fitfuel;

create table if not exists fitfuel.schema_migration (
  version varchar(64) primary key,
  applied_at timestamptz not null default now()
);

create table if not exists fitfuel.app_user (
  id bigint generated always as identity primary key,
  email varchar(320) unique,
  display_name varchar(100) not null,
  password_hash text,
  status smallint not null default 1 check (status in (0, 1)),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists fitfuel.user_profile (
  user_id bigint primary key references fitfuel.app_user(id) on delete cascade,
  height_cm numeric(5,2) not null check (height_cm between 50 and 300),
  age smallint not null check (age between 12 and 120),
  gender varchar(16) not null check (gender in ('male', 'female', 'other')),
  initial_weight_kg numeric(5,2) not null check (initial_weight_kg > 0),
  target_weight_kg numeric(5,2) not null check (target_weight_kg > 0),
  activity_level varchar(24) not null default 'moderate',
  timezone varchar(64) not null default 'Asia/Shanghai',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists fitfuel.nutrition_goal (
  id bigint generated always as identity primary key,
  user_id bigint not null references fitfuel.app_user(id) on delete cascade,
  goal_type varchar(16) not null check (goal_type in ('cut', 'gain', 'maintain')),
  calories_kcal integer not null check (calories_kcal > 0),
  protein_g numeric(7,2) not null check (protein_g >= 0),
  carbohydrate_g numeric(7,2) not null check (carbohydrate_g >= 0),
  fat_g numeric(7,2) not null check (fat_g >= 0),
  water_ml integer not null default 2000 check (water_ml > 0),
  effective_from date not null default current_date,
  effective_to date,
  created_at timestamptz not null default now(),
  check (effective_to is null or effective_to >= effective_from)
);

create unique index if not exists ux_nutrition_goal_active
  on fitfuel.nutrition_goal(user_id)
  where effective_to is null;

create table if not exists fitfuel.daily_record (
  id bigint generated always as identity primary key,
  user_id bigint not null references fitfuel.app_user(id) on delete cascade,
  record_date date not null,
  weight_kg numeric(5,2) check (weight_kg > 0),
  calories_consumed integer not null default 0 check (calories_consumed >= 0),
  activity_calories integer not null default 0 check (activity_calories >= 0),
  bmr numeric(8,2) not null default 0 check (bmr >= 0),
  tef numeric(8,2) not null default 0 check (tef >= 0),
  tdee numeric(8,2) not null default 0 check (tdee >= 0),
  calorie_balance numeric(8,2) not null default 0,
  note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, record_date)
);

create index if not exists ix_daily_record_user_date
  on fitfuel.daily_record(user_id, record_date desc);

create table if not exists fitfuel.meal (
  id bigint generated always as identity primary key,
  daily_record_id bigint not null references fitfuel.daily_record(id) on delete cascade,
  meal_type varchar(24) not null,
  display_name varchar(60) not null,
  sort_order smallint not null default 0,
  consumed_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists ix_meal_daily_record
  on fitfuel.meal(daily_record_id, sort_order);

create table if not exists fitfuel.meal_item (
  id bigint generated always as identity primary key,
  meal_id bigint not null references fitfuel.meal(id) on delete cascade,
  food_id integer references food_info.food(id) on delete set null,
  food_name_snapshot varchar(200) not null,
  quantity numeric(10,3) not null check (quantity > 0),
  unit varchar(32) not null,
  gram_weight numeric(10,3) check (gram_weight > 0),
  calories_snapshot numeric(10,2) not null check (calories_snapshot >= 0),
  protein_snapshot numeric(10,2) not null default 0 check (protein_snapshot >= 0),
  carbohydrate_snapshot numeric(10,2) not null default 0 check (carbohydrate_snapshot >= 0),
  fat_snapshot numeric(10,2) not null default 0 check (fat_snapshot >= 0),
  dietary_fiber_snapshot numeric(10,2) not null default 0 check (dietary_fiber_snapshot >= 0),
  source varchar(16) not null default 'database'
    check (source in ('database', 'user', 'ai')),
  created_at timestamptz not null default now()
);

create index if not exists ix_meal_item_meal on fitfuel.meal_item(meal_id);
create index if not exists ix_meal_item_food on fitfuel.meal_item(food_id);

create table if not exists fitfuel.water_log (
  id bigint generated always as identity primary key,
  user_id bigint not null references fitfuel.app_user(id) on delete cascade,
  amount_ml integer not null check (amount_ml > 0),
  logged_at timestamptz not null default now()
);

create index if not exists ix_water_log_user_time
  on fitfuel.water_log(user_id, logged_at desc);

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
  max(weight_kg) filter (where record_date = (
    select min(d2.record_date)
    from fitfuel.daily_record d2
    where d2.user_id = daily_record.user_id
      and date_trunc('week', d2.record_date) = date_trunc('week', daily_record.record_date)
  )) as start_weight_kg,
  max(weight_kg) filter (where record_date = (
    select max(d3.record_date)
    from fitfuel.daily_record d3
    where d3.user_id = daily_record.user_id
      and date_trunc('week', d3.record_date) = date_trunc('week', daily_record.record_date)
  )) as end_weight_kg
from fitfuel.daily_record
group by user_id, date_trunc('week', record_date);

insert into fitfuel.schema_migration(version)
values ('001_init_fitfuel')
on conflict (version) do nothing;

commit;
