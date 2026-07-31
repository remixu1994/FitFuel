begin;

create table if not exists fitfuel.activity_period_total (
  id bigserial primary key,
  user_id bigint not null references fitfuel.app_user(id) on delete cascade,
  period_start date not null,
  period_end date not null,
  active_calories_total numeric(12,2) not null,
  source varchar(16) not null default 'manual',
  note varchar(500),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, period_start, period_end),
  constraint ck_activity_period_total_range check (period_end >= period_start),
  constraint ck_activity_period_total_value check (
    active_calories_total >= 0 and active_calories_total <= 1000000
  )
);

create index if not exists ix_activity_period_total_user_end
  on fitfuel.activity_period_total(user_id, period_end desc);

commit;
