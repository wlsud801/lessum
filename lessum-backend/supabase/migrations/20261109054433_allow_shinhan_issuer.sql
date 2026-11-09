alter table public.card_collect_settings
  drop constraint card_collect_settings_issuer_check;
alter table public.card_collect_settings
  add constraint card_collect_settings_issuer_check
  check (issuer in ('hyundai', 'lotte', 'woori', 'samsung', 'shinhan'));

alter table public.collect_run_cards
  drop constraint collect_run_cards_issuer_check;
alter table public.collect_run_cards
  add constraint collect_run_cards_issuer_check
  check (issuer in ('hyundai', 'lotte', 'woori', 'samsung', 'shinhan'));

alter table public.statements
  drop constraint statements_issuer_check;
alter table public.statements
  add constraint statements_issuer_check
  check (issuer in ('hyundai', 'lotte', 'woori', 'samsung', 'shinhan'));
