begin;

drop policy "tournaments_delete_own"
on public.tournaments;

create policy "tournaments_delete_own"
on public.tournaments
for delete
to authenticated
using (
  organizer_id = auth.uid()
  and status in ('draft', 'collecting_availability')
);

create function public.delete_tournament(
  p_tournament_id uuid
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_status text;
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

  if v_status not in ('draft', 'collecting_availability') then
    raise exception using errcode = '55000';
  end if;

  delete from public.tournaments
  where id = p_tournament_id
    and organizer_id = auth.uid()
    and status in ('draft', 'collecting_availability');

  if not found then
    raise exception using errcode = '55000';
  end if;

  return pg_catalog.jsonb_build_object(
    'id', p_tournament_id,
    'deleted', true
  );
end;
$$;

revoke all on function public.delete_tournament(uuid)
  from public, anon, authenticated;

grant execute on function public.delete_tournament(uuid)
  to authenticated;

commit;
