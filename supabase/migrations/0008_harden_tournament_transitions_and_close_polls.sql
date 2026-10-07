begin;

revoke update on public.tournaments
  from public, anon, authenticated;

grant update (
  template_id,
  template_version,
  title,
  description,
  format,
  rules_snapshot,
  timezone
)
on public.tournaments
to authenticated;

revoke insert on public.tournaments
  from public, anon, authenticated;

grant insert (
  organizer_id,
  template_id,
  template_version,
  title,
  description,
  format,
  rules_snapshot,
  timezone
)
on public.tournaments
to authenticated;

drop policy "status_events_insert_own"
on public.tournament_status_events;

revoke insert on public.tournament_status_events
  from public, anon, authenticated;

create or replace function public.approve_tournament_schedule(
  p_tournament_id uuid,
  p_option_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_previous_status text;
  v_approved_at timestamptz := pg_catalog.now();
begin
  select t.status
  into v_previous_status
  from public.tournaments t
  where t.id = p_tournament_id
    and t.organizer_id = auth.uid()
  for update;

  if not found then
    raise exception using errcode = '42501';
  end if;

  if v_previous_status <> 'collecting_availability' then
    raise exception using errcode = '55000';
  end if;

  perform 1
  from public.availability_options ao
  where ao.id = p_option_id
    and ao.tournament_id = p_tournament_id
    and ao.is_active
  for update;

  if not found then
    raise exception using errcode = '22023';
  end if;

  if not exists (
    select 1
    from public.polls p
    join public.participant_responses pr on pr.poll_id = p.id
    where p.tournament_id = p_tournament_id
  ) then
    raise exception using errcode = '55000';
  end if;

  update public.tournaments
  set approved_option_id = p_option_id,
      approved_at = v_approved_at,
      status = 'schedule_approved',
      updated_at = v_approved_at
  where id = p_tournament_id;

  update public.polls
  set status = 'closed',
      closed_at = v_approved_at
  where tournament_id = p_tournament_id
    and status = 'open';

  insert into public.manual_tasks (
    tournament_id,
    task_key,
    title,
    status
  )
  values
    (
      p_tournament_id,
      'publish_whatsapp',
      'Publicar anuncio en WhatsApp',
      'pending'
    ),
    (
      p_tournament_id,
      'publish_limitless',
      'Registrar/publicar torneo en Limitless',
      'pending'
    )
  on conflict (tournament_id, task_key)
    where task_key is not null
  do nothing;

  insert into public.tournament_status_events (
    tournament_id,
    from_status,
    to_status,
    changed_by,
    note
  )
  values (
    p_tournament_id,
    v_previous_status,
    'schedule_approved',
    auth.uid(),
    'Organizer approved availability option'
  );

  return pg_catalog.jsonb_build_object(
    'approved_option_id', p_option_id,
    'approved_at', v_approved_at,
    'status', 'schedule_approved'
  );
end;
$$;

revoke all on function public.approve_tournament_schedule(uuid, uuid)
  from public, anon, authenticated;

grant execute on function public.approve_tournament_schedule(uuid, uuid)
  to authenticated;

create or replace function public.mark_tournament_announced(
  p_tournament_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_status text;
  v_announced_at timestamptz;
begin
  select t.status
  into v_status
  from public.tournaments t
  where t.id = p_tournament_id
    and t.organizer_id = auth.uid()
  for update;

  if not found then
    raise exception using errcode = '42501';
  end if;

  if v_status is distinct from 'schedule_approved' then
    raise exception using errcode = '55000';
  end if;

  v_announced_at := pg_catalog.now();

  update public.tournaments
  set status = 'announced',
      announced_at = v_announced_at,
      updated_at = v_announced_at
  where id = p_tournament_id
    and organizer_id = auth.uid();

  insert into public.tournament_status_events (
    tournament_id,
    from_status,
    to_status,
    changed_by,
    note
  )
  values (
    p_tournament_id,
    'schedule_approved',
    'announced',
    auth.uid(),
    'Organizer manually marked tournament as announced'
  );

  return pg_catalog.jsonb_build_object(
    'id', p_tournament_id,
    'status', 'announced',
    'announced_at', v_announced_at
  );
end;
$$;

revoke all on function public.mark_tournament_announced(uuid)
  from public, anon, authenticated;

grant execute on function public.mark_tournament_announced(uuid)
  to authenticated;

create or replace function public.get_public_poll(
  p_public_token_hash_hex text,
  p_participant_token_hash_hex text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_poll public.polls%rowtype;
  v_tournament public.tournaments%rowtype;
  v_response_id uuid;
  v_options jsonb;
  v_selected_option_ids jsonb;
  v_closure_reason text;
begin
  if p_public_token_hash_hex !~ '^[0-9a-f]{64}$'
    or p_participant_token_hash_hex !~ '^[0-9a-f]{64}$'
  then
    return null;
  end if;

  select p.*
  into v_poll
  from public.polls p
  where p.public_token_hash = pg_catalog.decode(p_public_token_hash_hex, 'hex');

  if not found then
    return null;
  end if;

  select t.*
  into v_tournament
  from public.tournaments t
  where t.id = v_poll.tournament_id;

  select coalesce(
    pg_catalog.jsonb_agg(
      pg_catalog.jsonb_build_object(
        'id', ao.id,
        'starts_at', ao.starts_at
      )
      order by ao.starts_at
    ),
    '[]'::jsonb
  )
  into v_options
  from public.availability_options ao
  where ao.tournament_id = v_poll.tournament_id
    and ao.is_active;

  select pr.id
  into v_response_id
  from public.participant_responses pr
  where pr.poll_id = v_poll.id
    and pr.participant_token_hash =
      pg_catalog.decode(p_participant_token_hash_hex, 'hex');

  select coalesce(
    pg_catalog.jsonb_agg(ase.availability_option_id),
    '[]'::jsonb
  )
  into v_selected_option_ids
  from public.availability_selections ase
  where ase.response_id = v_response_id;

  v_closure_reason := case
    when v_tournament.status in ('schedule_approved', 'announced')
      then 'schedule_confirmed'
    when v_tournament.status = 'completed' then 'completed'
    when v_tournament.status = 'cancelled' then 'cancelled'
    when v_poll.status <> 'open' then 'poll_closed'
    when v_poll.opens_at > pg_catalog.now() then 'not_open_yet'
    when v_poll.closes_at is not null
      and v_poll.closes_at <= pg_catalog.now() then 'poll_expired'
    when pg_catalog.jsonb_array_length(v_options) = 0 then 'no_active_options'
    else null
  end;

  return pg_catalog.jsonb_build_object(
    'title', v_tournament.title,
    'game', coalesce(v_tournament.rules_snapshot ->> 'game', ''),
    'format', v_tournament.format,
    'rules', coalesce(v_tournament.rules_snapshot ->> 'rules', ''),
    'time_zone', v_tournament.timezone,
    'is_open', v_closure_reason is null,
    'closure_reason', v_closure_reason,
    'options', v_options,
    'has_response', v_response_id is not null,
    'selected_option_ids', v_selected_option_ids
  );
end;
$$;

revoke all on function public.get_public_poll(text, text)
  from public, anon, authenticated;

grant execute on function public.get_public_poll(text, text)
  to service_role;

create or replace function public.submit_public_poll_response(
  p_public_token_hash_hex text,
  p_participant_token_hash_hex text,
  p_option_ids uuid[],
  p_action text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_poll public.polls%rowtype;
  v_tournament_status text;
  v_response_id uuid;
  v_inserted_id uuid;
  v_selected_option_ids jsonb;
  v_option_count integer;
  v_distinct_option_count integer;
begin
  if p_public_token_hash_hex !~ '^[0-9a-f]{64}$'
    or p_participant_token_hash_hex !~ '^[0-9a-f]{64}$'
  then
    return pg_catalog.jsonb_build_object('result', 'not_found');
  end if;

  select p.*
  into v_poll
  from public.polls p
  where p.public_token_hash = pg_catalog.decode(p_public_token_hash_hex, 'hex')
  for update;

  if not found then
    return pg_catalog.jsonb_build_object('result', 'not_found');
  end if;

  select t.status
  into v_tournament_status
  from public.tournaments t
  where t.id = v_poll.tournament_id;

  if v_poll.status <> 'open'
    or v_poll.opens_at > pg_catalog.now()
    or (v_poll.closes_at is not null and v_poll.closes_at <= pg_catalog.now())
    or v_tournament_status in (
      'schedule_approved',
      'announced',
      'completed',
      'cancelled'
    )
  then
    return pg_catalog.jsonb_build_object('result', 'closed');
  end if;

  if p_action is null
    or p_action not in ('submit', 'update')
    or p_option_ids is null
    or pg_catalog.cardinality(p_option_ids) < 1
    or pg_catalog.cardinality(p_option_ids) > 14
  then
    return pg_catalog.jsonb_build_object('result', 'invalid_options');
  end if;

  select pg_catalog.count(*), pg_catalog.count(distinct selected.option_id)
  into v_option_count, v_distinct_option_count
  from pg_catalog.unnest(p_option_ids) as selected(option_id);

  if v_option_count <> pg_catalog.cardinality(p_option_ids)
    or v_option_count <> v_distinct_option_count
    or (
      select pg_catalog.count(*)
      from public.availability_options ao
      where ao.tournament_id = v_poll.tournament_id
        and ao.is_active
        and ao.id = any(p_option_ids)
    ) <> pg_catalog.cardinality(p_option_ids)
  then
    return pg_catalog.jsonb_build_object('result', 'invalid_options');
  end if;

  if p_action = 'submit' then
    insert into public.participant_responses (
      poll_id,
      tournament_id,
      participant_token_hash
    )
    values (
      v_poll.id,
      v_poll.tournament_id,
      pg_catalog.decode(p_participant_token_hash_hex, 'hex')
    )
    on conflict (poll_id, participant_token_hash) do nothing
    returning id into v_inserted_id;

    if v_inserted_id is null then
      select pr.id
      into v_response_id
      from public.participant_responses pr
      where pr.poll_id = v_poll.id
        and pr.participant_token_hash =
          pg_catalog.decode(p_participant_token_hash_hex, 'hex')
      for update;

      select coalesce(
        pg_catalog.jsonb_agg(ase.availability_option_id),
        '[]'::jsonb
      )
      into v_selected_option_ids
      from public.availability_selections ase
      where ase.response_id = v_response_id;

      return pg_catalog.jsonb_build_object(
        'result', 'already_submitted',
        'selected_option_ids', v_selected_option_ids
      );
    end if;

    v_response_id := v_inserted_id;
  else
    select pr.id
    into v_response_id
    from public.participant_responses pr
    where pr.poll_id = v_poll.id
      and pr.participant_token_hash =
        pg_catalog.decode(p_participant_token_hash_hex, 'hex')
    for update;

    if not found then
      return pg_catalog.jsonb_build_object('result', 'response_not_found');
    end if;

    delete from public.availability_selections ase
    where ase.response_id = v_response_id;

    update public.participant_responses
    set updated_at = pg_catalog.now()
    where id = v_response_id;
  end if;

  insert into public.availability_selections (
    tournament_id,
    response_id,
    availability_option_id
  )
  select
    v_poll.tournament_id,
    v_response_id,
    selected.option_id
  from pg_catalog.unnest(p_option_ids) as selected(option_id);

  return pg_catalog.jsonb_build_object(
    'result',
    case when p_action = 'submit' then 'submitted' else 'updated' end
  );
end;
$$;

revoke all on function public.submit_public_poll_response(text, text, uuid[], text)
  from public, anon, authenticated;

grant execute on function public.submit_public_poll_response(text, text, uuid[], text)
  to service_role;

commit;
