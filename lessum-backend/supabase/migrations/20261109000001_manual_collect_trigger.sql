alter table public.collect_runs
  drop constraint collect_runs_trigger_check;

alter table public.collect_runs
  add constraint collect_runs_trigger_check
  check (trigger in ('initial', 'scheduled', 'manual'));
