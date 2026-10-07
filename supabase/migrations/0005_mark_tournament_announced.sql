begin;

alter table public.tournaments
  add column announced_at timestamptz null;

create function public.mark_tournament_announced(
  p_tournament_id uuid
)
returns jsonb
language plpgsql
security invoker
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

commit;
