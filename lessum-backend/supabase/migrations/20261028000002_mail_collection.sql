alter table public.user_consents
  drop constraint user_consents_consent_type_check;

alter table public.user_consents
  add constraint user_consents_consent_type_check
  check (consent_type in ('terms', 'privacy', 'mail_credential_storage'));

create table public.mail_connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users (id) on delete cascade,
  provider text not null check (provider in ('naver')),
  email text not null,
  app_password_encrypted text not null,
  status text not null default 'pending' check (status in ('pending', 'active')),
  expires_at timestamptz,
  verified_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((status = 'pending') = (expires_at is not null))
);

create table public.collect_settings (
  user_id uuid primary key references auth.users (id) on delete cascade,
  mailbox_name text not null,
  mailbox_imap_name text not null,
  start_date date not null,
  auto_register_enabled boolean not null default false,
  auto_register_enabled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.card_collect_settings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  issuer text not null check (issuer in ('hyundai', 'lotte', 'woori', 'samsung')),
  enabled boolean not null default true,
  arrival_day smallint check (arrival_day between 1 and 31),
  arrival_is_month_end boolean not null default false,
  statement_password_encrypted text,
  next_collect_on date,
  last_collected_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, issuer),
  check (arrival_is_month_end = (arrival_day is null))
);

create index card_collect_settings_due_idx
  on public.card_collect_settings (next_collect_on) where enabled;

create table public.collect_runs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  trigger text not null check (trigger in ('initial', 'scheduled')),
  status text not null default 'queued'
    check (status in ('queued', 'running', 'completed', 'failed')),
  error_code text,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default now()
);

create index collect_runs_user_idx
  on public.collect_runs (user_id, created_at desc);

create table public.collect_run_cards (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.collect_runs (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  issuer text not null check (issuer in ('hyundai', 'lotte', 'woori', 'samsung')),
  status text not null default 'queued' check (status in (
    'queued', 'not_found', 'received', 'password_required', 'parsed',
    'needs_review', 'online_statement_required', 'unsupported_format', 'error'
  )),
  statements_found integer not null default 0,
  rows_added integer not null default 0,
  rows_duplicated integer not null default 0,
  rows_review integer not null default 0,
  error_code text,
  updated_at timestamptz not null default now(),
  unique (run_id, issuer)
);

create table public.statements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  issuer text not null check (issuer in ('hyundai', 'lotte', 'woori', 'samsung')),
  imap_uidvalidity bigint not null,
  imap_uid bigint not null,
  message_id text,
  attachment_sha256 text not null,
  payment_date date,
  validation jsonb,
  created_at timestamptz not null default now(),
  unique (user_id, issuer, imap_uidvalidity, imap_uid),
  unique (user_id, issuer, attachment_sha256)
);

create table public.statement_rows (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  statement_id uuid not null references public.statements (id) on delete cascade,
  source_row_id text not null,
  kind text not null,
  posting_status text not null default 'candidate'
    check (posting_status = 'candidate'),
  transaction_date date,
  raw_date text,
  date_basis text,
  merchant text,
  original_amount numeric(18, 4),
  currency text,
  amount_krw bigint,
  billed_principal_krw bigint,
  fee_krw bigint,
  billed_amount_krw bigint,
  installment_months smallint,
  installment_round smallint,
  requires_review boolean not null default false,
  review_reasons text[] not null default '{}',
  created_at timestamptz not null default now(),
  unique (statement_id, source_row_id)
);

create trigger mail_connections_set_updated_at
  before update on public.mail_connections
  for each row execute function public.set_updated_at();

create trigger collect_settings_set_updated_at
  before update on public.collect_settings
  for each row execute function public.set_updated_at();

create trigger card_collect_settings_set_updated_at
  before update on public.card_collect_settings
  for each row execute function public.set_updated_at();

create trigger collect_run_cards_set_updated_at
  before update on public.collect_run_cards
  for each row execute function public.set_updated_at();

alter table public.mail_connections enable row level security;
alter table public.collect_settings enable row level security;
alter table public.card_collect_settings enable row level security;
alter table public.collect_runs enable row level security;
alter table public.collect_run_cards enable row level security;
alter table public.statements enable row level security;
alter table public.statement_rows enable row level security;

create policy "collect_settings_select_own"
  on public.collect_settings for select
  using (auth.uid() = user_id);

create policy "collect_runs_select_own"
  on public.collect_runs for select
  using (auth.uid() = user_id);

create policy "collect_run_cards_select_own"
  on public.collect_run_cards for select
  using (auth.uid() = user_id);

create policy "statements_select_own"
  on public.statements for select
  using (auth.uid() = user_id);

create policy "statement_rows_select_own"
  on public.statement_rows for select
  using (auth.uid() = user_id);
