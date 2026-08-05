begin;

create table if not exists fitfuel.mobile_auth_session (
  id bigint generated always as identity primary key,
  user_id bigint not null references fitfuel.app_user(id) on delete cascade,
  access_token_hash char(64) not null unique,
  refresh_token_hash char(64) not null unique,
  access_expires_at timestamptz not null,
  refresh_expires_at timestamptz not null,
  device_name varchar(120) not null default 'FitFuel Android',
  created_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  revoked_at timestamptz
);

create index if not exists ix_mobile_auth_session_user
  on fitfuel.mobile_auth_session(user_id);
create index if not exists ix_mobile_auth_session_refresh_expiry
  on fitfuel.mobile_auth_session(refresh_expires_at)
  where revoked_at is null;

insert into fitfuel.schema_migration(version)
values ('011_mobile_auth')
on conflict (version) do nothing;

commit;
