begin;

alter table public.availability_options
  alter column ends_at drop not null;

alter table public.availability_options
  drop constraint availability_options_time_ck;

alter table public.participant_responses
  rename column update_token_hash to participant_token_hash;

alter table public.participant_responses
  drop constraint participant_responses_update_token_hash_key;

create or replace function public.configure_tournament_availability(
  p_tournament_id uuid,
  p_options jsonb
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_option_count integer;
  v_distinct_option_count integer;
begin
  perform 1
  from public.tournaments t
  where t.id = p_tournament_id
    and t.organizer_id = auth.uid()
  for update;

  if not found then
    raise exception using errcode = '42501';
  end if;

  if exists (
    select 1
    from public.polls p
    where p.tournament_id = p_tournament_id
  ) then
    raise exception using errcode = '55000';
  end if;

  if p_options is null
    or pg_catalog.jsonb_typeof(p_options) <> 'array'
    or pg_catalog.jsonb_array_length(p_options) < 1
    or pg_catalog.jsonb_array_length(p_options) > 14
  then
    raise exception using errcode = '22023';
  end if;

  select pg_catalog.count(*), pg_catalog.count(distinct candidate.starts_at)
  into v_option_count, v_distinct_option_count
  from pg_catalog.jsonb_to_recordset(p_options) as candidate(starts_at timestamptz);

  if v_option_count < 1 or v_option_count <> v_distinct_option_count then
    raise exception using errcode = '22023';
  end if;

  delete from public.availability_options ao
  where ao.tournament_id = p_tournament_id;

  insert into public.availability_options (
    tournament_id,
    starts_at,
    ends_at,
    is_active
  )
  select
    p_tournament_id,
    candidate.starts_at,
    null,
    true
  from pg_catalog.jsonb_to_recordset(p_options) as candidate(starts_at timestamptz);

  return pg_catalog.jsonb_array_length(p_options);
end;
$$;

create or replace function public.create_public_poll_for_tournament(
  p_tournament_id uuid,
  p_public_token_hash_hex text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_poll_id uuid;
  v_previous_status text;
begin
  select t.status
  into v_previous_status
  from public.tournaments t
  where t.id = p_tournament_id
    and t.organizer_id = auth.uid()
  for update;

  if v_previous_status is null then
    raise exception using errcode = '42501';
  end if;

  if v_previous_status not in ('draft', 'collecting_availability') then
    raise exception using errcode = '55000';
  end if;

  if p_public_token_hash_hex !~ '^[0-9a-f]{64}$'
    or (
      select pg_catalog.count(*)
      from public.availability_options ao
      where ao.tournament_id = p_tournament_id
        and ao.is_active
    ) = 0
  then
    raise exception using errcode = '22023';
  end if;

  if exists (
    select 1
    from public.polls p
    where p.tournament_id = p_tournament_id
  ) then
    raise exception using errcode = '23505';
  end if;

  insert into public.polls (
    tournament_id,
    public_token_hash,
    status,
    opens_at
  )
  values (
    p_tournament_id,
    pg_catalog.decode(p_public_token_hash_hex, 'hex'),
    'open',
    pg_catalog.now()
  )
  returning id into v_poll_id;

  update public.tournaments
  set status = 'collecting_availability',
      updated_at = pg_catalog.now()
  where id = p_tournament_id;

  if v_previous_status <> 'collecting_availability' then
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
      'collecting_availability',
      auth.uid(),
      'Availability poll generated'
    );
  end if;

  return v_poll_id;
end;
$$;

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

  return pg_catalog.jsonb_build_object(
    'title', v_tournament.title,
    'game', coalesce(v_tournament.rules_snapshot ->> 'game', ''),
    'format', v_tournament.format,
    'rules', coalesce(v_tournament.rules_snapshot ->> 'rules', ''),
    'time_zone', v_tournament.timezone,
    'is_open',
      v_poll.status = 'open'
      and v_poll.opens_at <= pg_catalog.now()
      and (v_poll.closes_at is null or v_poll.closes_at > pg_catalog.now())
      and v_tournament.status not in ('cancelled', 'completed')
      and pg_catalog.jsonb_array_length(v_options) > 0,
    'options', v_options,
    'has_response', v_response_id is not null,
    'selected_option_ids', v_selected_option_ids
  );
end;
$$;

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
    or v_tournament_status in ('cancelled', 'completed')
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

revoke all on function public.configure_tournament_availability(uuid, jsonb)
  from public, anon;
grant execute on function public.configure_tournament_availability(uuid, jsonb)
  to authenticated;

revoke all on function public.create_public_poll_for_tournament(uuid, text)
  from public, anon;
grant execute on function public.create_public_poll_for_tournament(uuid, text)
  to authenticated;

revoke all on function public.get_public_poll(text, text)
  from public, anon, authenticated;
grant execute on function public.get_public_poll(text, text)
  to service_role;

revoke all on function public.submit_public_poll_response(text, text, uuid[], text)
  from public, anon, authenticated;
grant execute on function public.submit_public_poll_response(text, text, uuid[], text)
  to service_role;

commit;