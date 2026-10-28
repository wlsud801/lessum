create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  timezone text not null default 'Asia/Seoul',
  onboarded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.user_consents (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  consent_type text not null check (consent_type in ('terms', 'privacy')),
  version text not null,
  agreed_at timestamptz not null default now(),
  unique (user_id, consent_type, version)
);

create index user_consents_user_id_idx on public.user_consents (user_id);

create function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

create function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  terms_version text := new.raw_user_meta_data ->> 'terms_version';
  privacy_version text := new.raw_user_meta_data ->> 'privacy_version';
begin
  insert into public.profiles (id) values (new.id);

  if terms_version is not null then
    insert into public.user_consents (user_id, consent_type, version)
    values (new.id, 'terms', terms_version);
  end if;

  if privacy_version is not null then
    insert into public.user_consents (user_id, consent_type, version)
    values (new.id, 'privacy', privacy_version);
  end if;

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

alter table public.profiles enable row level security;
alter table public.user_consents enable row level security;

create policy "profiles_select_own"
  on public.profiles for select
  using (auth.uid() = id);

create policy "profiles_update_own"
  on public.profiles for update
  using (auth.uid() = id)
  with check (auth.uid() = id);

create policy "user_consents_select_own"
  on public.user_consents for select
  using (auth.uid() = user_id);
