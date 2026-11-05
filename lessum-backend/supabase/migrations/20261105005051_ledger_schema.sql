-- 가계부 원장 스키마: transactions 중심 구조 세팅
-- 기존 statements/statement_rows는 수집 파이프라인 전환 전까지 유지

-- 1. 금융기관 기본 목록
create table public.financial_institutions (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  institution_type text not null
    check (institution_type in ('CARD_ISSUER', 'BANK', 'SECURITIES')),
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

insert into public.financial_institutions (code, name, institution_type) values
  ('HYUNDAI_CARD', '현대카드', 'CARD_ISSUER'),
  ('LOTTE_CARD', '롯데카드', 'CARD_ISSUER'),
  ('WOORI_CARD', '우리카드', 'CARD_ISSUER'),
  ('SAMSUNG_CARD', '삼성카드', 'CARD_ISSUER'),
  ('SHINHAN_CARD', '신한카드', 'CARD_ISSUER'),
  ('SHINHAN_BANK', '신한은행', 'BANK'),
  ('KB_KOOKMIN_BANK', 'KB국민은행', 'BANK'),
  ('SAMSUNG_SECURITIES', '삼성증권', 'SECURITIES');

-- 2. 사용자 결제 수단 (카드·계좌·현금)
create table public.payment_methods (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  method_type text not null check (method_type in ('CARD', 'ACCOUNT', 'CASH')),
  institution_id uuid references public.financial_institutions (id),
  nickname text not null,
  last_four varchar(4),
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((method_type = 'CASH') = (institution_id is null))
);

create index payment_methods_user_idx
  on public.payment_methods (user_id) where archived_at is null;

-- 3. 카테고리 (대분류 parent_id null / 소분류 parent_id 지정)
create table public.categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  parent_id uuid references public.categories (id) on delete cascade,
  name text not null,
  sort_order integer not null default 0,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (parent_id is distinct from id)
);

create index categories_user_idx
  on public.categories (user_id, parent_id, sort_order) where archived_at is null;

-- 4. 반복 규칙과 개별 예정
create table public.recurring_rules (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  name text not null,
  frequency text not null
    check (frequency in ('DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY')),
  start_date date not null,
  end_date date,
  expected_amount bigint check (expected_amount > 0),
  payment_method_id uuid references public.payment_methods (id) on delete set null,
  category_id uuid references public.categories (id) on delete set null,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_date is null or end_date >= start_date)
);

create index recurring_rules_user_idx
  on public.recurring_rules (user_id) where archived_at is null;

create table public.recurring_occurrences (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  rule_id uuid not null references public.recurring_rules (id) on delete cascade,
  scheduled_date date not null,
  expected_amount bigint check (expected_amount > 0),
  skipped_at timestamptz,
  created_at timestamptz not null default now(),
  unique (rule_id, scheduled_date)
);

create index recurring_occurrences_user_idx
  on public.recurring_occurrences (user_id, scheduled_date desc);

-- 5. 거래 (하루하루 화면의 중심 테이블)
create table public.transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  transaction_date date,
  transaction_type text not null check (transaction_type in (
    'INCOME', 'CARD_EXPENSE', 'ACCOUNT_EXPENSE', 'CASH_EXPENSE',
    'EXPENSE_REFUND', 'INCOME_RETURN', 'CARD_BILL_PAYMENT', 'INTERNAL_TRANSFER'
  )),
  merchant_name varchar(100),
  amount bigint check (amount > 0),
  payment_method_id uuid references public.payment_methods (id) on delete set null,
  counter_payment_method_id uuid references public.payment_methods (id) on delete set null,
  category_id uuid references public.categories (id) on delete set null,
  source_type text not null
    check (source_type in ('EMAIL', 'STATEMENT_FILE', 'CSV', 'MANUAL')),
  payment_plan text
    check (payment_plan in ('ONE_TIME', 'INSTALLMENT', 'UNKNOWN')),
  installment_months smallint check (installment_months >= 2),
  recurring_occurrence_id uuid
    references public.recurring_occurrences (id) on delete set null,
  related_transaction_id uuid
    references public.transactions (id) on delete set null,
  memo text,
  client_request_id uuid,
  version integer not null default 1,
  voided_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((payment_plan = 'INSTALLMENT') = (installment_months is not null))
);

create index transactions_user_date_idx
  on public.transactions (user_id, transaction_date desc, id desc)
  where deleted_at is null;

create unique index transactions_client_request_uq
  on public.transactions (user_id, client_request_id)
  where client_request_id is not null;

-- 6. 할부 회차별 청구
create table public.installment_charges (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  transaction_id uuid not null references public.transactions (id) on delete cascade,
  installment_no smallint not null check (installment_no >= 1),
  billing_month date not null check (extract(day from billing_month) = 1),
  billed_amount bigint check (billed_amount > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (transaction_id, installment_no)
);

create index installment_charges_user_month_idx
  on public.installment_charges (user_id, billing_month desc);

-- 7. 확인 필요 사유 (reason은 파서 코드가 다양해 text로 둠)
create table public.transaction_reviews (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  transaction_id uuid not null references public.transactions (id) on delete cascade,
  reason text not null,
  resolved_at timestamptz,
  created_at timestamptz not null default now()
);

create unique index transaction_reviews_open_uq
  on public.transaction_reviews (transaction_id, reason)
  where resolved_at is null;

create index transaction_reviews_user_open_idx
  on public.transaction_reviews (user_id) where resolved_at is null;

-- 8. 수집 작업 이력과 개별 항목
create table public.import_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  source_type text not null
    check (source_type in ('EMAIL', 'STATEMENT_FILE', 'CSV')),
  status text not null default 'queued'
    check (status in ('queued', 'running', 'completed', 'failed')),
  error_code text,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default now()
);

create index import_jobs_user_idx
  on public.import_jobs (user_id, created_at desc);

create table public.import_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  job_id uuid not null references public.import_jobs (id) on delete cascade,
  transaction_id uuid references public.transactions (id) on delete set null,
  source_namespace text not null,
  source_item_key text not null,
  extracted_date text,
  extracted_merchant text,
  extracted_amount_krw bigint,
  created_at timestamptz not null default now(),
  unique (user_id, source_namespace, source_item_key)
);

create index import_items_job_idx on public.import_items (job_id);

-- 9. updated_at 트리거
create trigger payment_methods_set_updated_at
  before update on public.payment_methods
  for each row execute function public.set_updated_at();

create trigger categories_set_updated_at
  before update on public.categories
  for each row execute function public.set_updated_at();

create trigger recurring_rules_set_updated_at
  before update on public.recurring_rules
  for each row execute function public.set_updated_at();

create trigger transactions_set_updated_at
  before update on public.transactions
  for each row execute function public.set_updated_at();

create trigger installment_charges_set_updated_at
  before update on public.installment_charges
  for each row execute function public.set_updated_at();

-- 10. RLS
alter table public.financial_institutions enable row level security;
alter table public.payment_methods enable row level security;
alter table public.categories enable row level security;
alter table public.recurring_rules enable row level security;
alter table public.recurring_occurrences enable row level security;
alter table public.transactions enable row level security;
alter table public.installment_charges enable row level security;
alter table public.transaction_reviews enable row level security;
alter table public.import_jobs enable row level security;
alter table public.import_items enable row level security;

create policy "financial_institutions_select_all"
  on public.financial_institutions for select
  to authenticated using (true);

create policy "payment_methods_all_own" on public.payment_methods
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "categories_all_own" on public.categories
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "recurring_rules_all_own" on public.recurring_rules
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "recurring_occurrences_all_own" on public.recurring_occurrences
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "transactions_all_own" on public.transactions
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "installment_charges_all_own" on public.installment_charges
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "transaction_reviews_all_own" on public.transaction_reviews
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "import_jobs_select_own" on public.import_jobs
  for select using (auth.uid() = user_id);

create policy "import_items_select_own" on public.import_items
  for select using (auth.uid() = user_id);

-- 11. 기존 수집 데이터 백필
-- 11-1. 명세서 발급사별 카드 수단 자동 생성
insert into public.payment_methods (user_id, method_type, institution_id, nickname)
select distinct s.user_id, 'CARD', fi.id, fi.name
from public.statements s
join public.financial_institutions fi on fi.code = upper(s.issuer) || '_CARD';

-- 11-2. statement_rows → transactions (id 유지, 금액은 양수 변환)
insert into public.transactions (
  id, user_id, transaction_date, transaction_type, merchant_name, amount,
  payment_method_id, source_type, payment_plan, installment_months,
  memo, created_at
)
select
  sr.id,
  sr.user_id,
  sr.transaction_date,
  case when sr.kind = 'refund' then 'EXPENSE_REFUND' else 'CARD_EXPENSE' end,
  left(sr.merchant, 100),
  case
    when sr.amount_krw is null or sr.amount_krw = 0 then null
    else abs(sr.amount_krw)
  end,
  pm.id,
  'EMAIL',
  case when sr.installment_months >= 2 then 'INSTALLMENT' else 'UNKNOWN' end,
  case when sr.installment_months >= 2 then sr.installment_months end,
  nullif(concat_ws(' · ',
    case
      when sr.transaction_date is null and sr.raw_date is not null
        then '명세서 날짜 ' || sr.raw_date
    end,
    case when sr.kind = 'adjustment_reference' then '명세서 조정 참고 행' end
  ), ''),
  sr.created_at
from public.statement_rows sr
join public.statements s on s.id = sr.statement_id
left join public.financial_institutions fi on fi.code = upper(s.issuer) || '_CARD'
left join public.payment_methods pm
  on pm.user_id = sr.user_id and pm.institution_id = fi.id;

-- 11-3. 확인 필요 사유 이관
insert into public.transaction_reviews (user_id, transaction_id, reason, created_at)
select sr.user_id, sr.id, it_reason, sr.created_at
from public.statement_rows sr
cross join lateral unnest(sr.review_reasons) as it_reason
where sr.requires_review;

-- 11-4. 할부 회차 정보 이관 (청구월은 명세서 결제일 기준)
insert into public.installment_charges (
  user_id, transaction_id, installment_no, billing_month, billed_amount
)
select
  sr.user_id,
  sr.id,
  sr.installment_round,
  date_trunc('month', coalesce(
    s.payment_date, sr.transaction_date, sr.created_at::date
  ))::date,
  case
    when coalesce(sr.billed_amount_krw, sr.billed_principal_krw) is null then null
    when coalesce(sr.billed_amount_krw, sr.billed_principal_krw) = 0 then null
    else abs(coalesce(sr.billed_amount_krw, sr.billed_principal_krw))
  end
from public.statement_rows sr
join public.statements s on s.id = sr.statement_id
where sr.installment_round is not null;
