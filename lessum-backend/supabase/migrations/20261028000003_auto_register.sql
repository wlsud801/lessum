create function public.enable_auto_register(
  p_user_id uuid,
  p_consent_version text,
  p_next_dates jsonb
)
returns uuid
language plpgsql
as $$
declare
  v_run_id uuid;
begin
  if not exists (
    select 1 from public.collect_settings where user_id = p_user_id
  ) then
    raise exception 'COLLECT_SETTINGS_REQUIRED';
  end if;

  if not exists (
    select 1 from public.card_collect_settings
    where user_id = p_user_id and enabled
  ) then
    raise exception 'CARD_SETTINGS_REQUIRED';
  end if;

  update public.mail_connections
  set status = 'active', expires_at = null
  where user_id = p_user_id
    and (status = 'active' or expires_at > now());

  if not found then
    raise exception 'MAIL_CONNECTION_REQUIRED';
  end if;

  insert into public.user_consents (user_id, consent_type, version)
  values (p_user_id, 'mail_credential_storage', p_consent_version)
  on conflict (user_id, consent_type, version) do nothing;

  update public.card_collect_settings
  set next_collect_on = (p_next_dates ->> issuer)::date
  where user_id = p_user_id and enabled;

  update public.collect_settings
  set auto_register_enabled = true,
      auto_register_enabled_at = coalesce(auto_register_enabled_at, now())
  where user_id = p_user_id;

  select id into v_run_id
  from public.collect_runs
  where user_id = p_user_id and status in ('queued', 'running')
  order by created_at desc
  limit 1;

  if v_run_id is null then
    insert into public.collect_runs (user_id, trigger)
    values (p_user_id, 'initial')
    returning id into v_run_id;

    insert into public.collect_run_cards (run_id, user_id, issuer)
    select v_run_id, user_id, issuer
    from public.card_collect_settings
    where user_id = p_user_id and enabled;
  end if;

  return v_run_id;
end;
$$;

create function public.disable_auto_register(p_user_id uuid)
returns void
language plpgsql
as $$
begin
  update public.collect_settings
  set auto_register_enabled = false
  where user_id = p_user_id;

  update public.collect_runs
  set status = 'failed',
      error_code = 'AUTO_REGISTER_DISABLED',
      finished_at = now()
  where user_id = p_user_id and status = 'queued';

  update public.collect_run_cards
  set status = 'error', error_code = 'AUTO_REGISTER_DISABLED'
  where user_id = p_user_id and status = 'queued';
end;
$$;

create function public.disconnect_mail(p_user_id uuid)
returns void
language plpgsql
as $$
begin
  perform public.disable_auto_register(p_user_id);

  update public.card_collect_settings
  set statement_password_encrypted = null
  where user_id = p_user_id;

  delete from public.mail_connections where user_id = p_user_id;
end;
$$;

revoke all on function public.enable_auto_register(uuid, text, jsonb)
  from public, anon, authenticated;
revoke all on function public.disable_auto_register(uuid)
  from public, anon, authenticated;
revoke all on function public.disconnect_mail(uuid)
  from public, anon, authenticated;

grant execute on function public.enable_auto_register(uuid, text, jsonb)
  to service_role;
grant execute on function public.disable_auto_register(uuid) to service_role;
grant execute on function public.disconnect_mail(uuid) to service_role;
