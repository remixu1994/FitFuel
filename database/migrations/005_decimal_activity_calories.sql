begin;

drop view if exists fitfuel.weekly_summary;

alter table fitfuel.daily_record
  alter column activity_calories type numeric(10,2)
  using activity_calories::numeric(10,2);

alter table fitfuel.daily_record
  alter column activity_calories set default 0;

alter table fitfuel.daily_data_import_row
  alter column imported_activity_calories type numeric(10,2)
  using imported_activity_calories::numeric(10,2);

create view fitfuel.weekly_summary as
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
values ('005_decimal_activity_calories')
on conflict (version) do nothing;

commit;
