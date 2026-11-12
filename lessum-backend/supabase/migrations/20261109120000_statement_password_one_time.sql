alter table public.card_collect_settings
  add column statement_password_one_time boolean not null default false;
