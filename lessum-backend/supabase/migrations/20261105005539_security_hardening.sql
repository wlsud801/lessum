-- advisor 경고 정리: RLS 정책 누락, 시크릿 컬럼 노출 차단, 함수 권한·search_path, FK 인덱스, initplan

-- 1. mail_connections / card_collect_settings: select 정책 추가 + 암호화 컬럼 노출 차단
revoke select on public.mail_connections from anon, authenticated;
grant select (id, user_id, provider, email, status, expires_at, verified_at, created_at, updated_at)
  on public.mail_connections to authenticated;

create policy "mail_connections_select_own" on public.mail_connections
  for select to authenticated
  using ((select auth.uid()) = user_id);

revoke select on public.card_collect_settings from anon, authenticated;
grant select (id, user_id, issuer, enabled, arrival_day, arrival_is_month_end,
  next_collect_on, last_collected_at, created_at, updated_at)
  on public.card_collect_settings to authenticated;

create policy "card_collect_settings_select_own" on public.card_collect_settings
  for select to authenticated
  using ((select auth.uid()) = user_id);

-- 2. SECURITY DEFINER 함수 RPC 노출 차단 (트리거 실행 주체에는 명시적 grant)
revoke execute on function public.handle_new_user() from public, anon, authenticated;
grant execute on function public.handle_new_user() to supabase_auth_admin;
revoke execute on function public.rls_auto_enable() from public, anon, authenticated;

-- 3. 백엔드(service_role) 전용 RPC 함수도 클라이언트 호출 차단
revoke execute on function public.disable_auto_register(uuid) from public, anon, authenticated;
grant execute on function public.disable_auto_register(uuid) to service_role;
revoke execute on function public.disconnect_mail(uuid) from public, anon, authenticated;
grant execute on function public.disconnect_mail(uuid) to service_role;
revoke execute on function public.enable_auto_register(uuid, text, jsonb) from public, anon, authenticated;
grant execute on function public.enable_auto_register(uuid, text, jsonb) to service_role;

-- 4. 함수 search_path 고정 (본문이 전부 스키마 한정 참조임을 확인함)
alter function public.set_updated_at() set search_path = '';
alter function public.disable_auto_register(uuid) set search_path = '';
alter function public.disconnect_mail(uuid) set search_path = '';
alter function public.enable_auto_register(uuid, text, jsonb) set search_path = '';

-- 5. RLS initplan 최적화: auth.uid() → (select auth.uid()), 대상 역할도 authenticated로 한정
alter policy "profiles_select_own" on public.profiles
  to authenticated using ((select auth.uid()) = id);
alter policy "profiles_update_own" on public.profiles
  to authenticated using ((select auth.uid()) = id) with check ((select auth.uid()) = id);
alter policy "user_consents_select_own" on public.user_consents
  to authenticated using ((select auth.uid()) = user_id);
alter policy "collect_settings_select_own" on public.collect_settings
  to authenticated using ((select auth.uid()) = user_id);
alter policy "collect_runs_select_own" on public.collect_runs
  to authenticated using ((select auth.uid()) = user_id);
alter policy "collect_run_cards_select_own" on public.collect_run_cards
  to authenticated using ((select auth.uid()) = user_id);
alter policy "statements_select_own" on public.statements
  to authenticated using ((select auth.uid()) = user_id);
alter policy "statement_rows_select_own" on public.statement_rows
  to authenticated using ((select auth.uid()) = user_id);
alter policy "payment_methods_all_own" on public.payment_methods
  to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
alter policy "categories_all_own" on public.categories
  to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
alter policy "recurring_rules_all_own" on public.recurring_rules
  to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
alter policy "recurring_occurrences_all_own" on public.recurring_occurrences
  to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
alter policy "transactions_all_own" on public.transactions
  to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
alter policy "installment_charges_all_own" on public.installment_charges
  to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
alter policy "transaction_reviews_all_own" on public.transaction_reviews
  to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
alter policy "import_jobs_select_own" on public.import_jobs
  to authenticated using ((select auth.uid()) = user_id);
alter policy "import_items_select_own" on public.import_items
  to authenticated using ((select auth.uid()) = user_id);

-- 6. FK 커버링 인덱스
create index categories_parent_idx on public.categories (parent_id);
create index collect_run_cards_user_idx on public.collect_run_cards (user_id);
create index import_items_transaction_idx on public.import_items (transaction_id);
create index payment_methods_institution_idx on public.payment_methods (institution_id);
create index recurring_rules_category_idx on public.recurring_rules (category_id);
create index recurring_rules_payment_method_idx on public.recurring_rules (payment_method_id);
create index statement_rows_user_idx on public.statement_rows (user_id);
create index transactions_category_idx on public.transactions (category_id);
create index transactions_counter_payment_method_idx on public.transactions (counter_payment_method_id);
create index transactions_payment_method_idx on public.transactions (payment_method_id);
create index transactions_recurring_occurrence_idx on public.transactions (recurring_occurrence_id);
create index transactions_related_transaction_idx on public.transactions (related_transaction_id);
