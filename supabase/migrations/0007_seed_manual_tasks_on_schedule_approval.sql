begin;

alter table public.manual_tasks
  add column task_key text null;

alter table public.manual_tasks
  add constraint manual_tasks_task_key_ck
  check (
    task_key is null
    or task_key in ('publish_whatsapp', 'publish_limitless')
  );

create unique index manual_tasks_tournament_task_key_uq
  on public.manual_tasks (tournament_id, task_key)
  where task_key is not null;

create or replace function public.approve_tournament_schedule(
  p_tournament_id uuid,
  p_option_id uuid
)
returns jsonb
language plpgsql
security invoker
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

commit;
