begin;

alter table fitfuel.elevatine_import_item
  drop constraint if exists ck_elevatine_item_match;

alter table fitfuel.elevatine_import_item
  add constraint ck_elevatine_item_match check (
    match_status in ('matched','ambiguous','unmatched','estimated','estimate_failed')
  );

commit;
