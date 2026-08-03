begin;
alter table fitfuel.user_profile add column if not exists meal_count smallint not null default 3;
-- The existing account uses four daily meal groups; all other accounts keep the default of three.
update fitfuel.user_profile p set meal_count=4
where p.user_id=(select id from fitfuel.app_user where lower(email)=lower('xnysym@outlook.com'))
  and coalesce(p.meal_count,3)=3;
commit;
