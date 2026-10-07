begin;

alter table public.message_drafts
  drop constraint message_drafts_kind_check;

alter table public.message_drafts
  add constraint message_drafts_kind_check
  check (kind in ('invitation', 'final_announcement', 'limitless_description'));

create sequence public.tournament_weekly_number_seq
  as bigint
  no cycle;

alter table public.tournaments
  add column weekly_number bigint;

alter sequence public.tournament_weekly_number_seq
  owned by public.tournaments.weekly_number;

alter table public.tournaments
  add constraint tournaments_weekly_number_uq
  unique (weekly_number);

create function public.assign_tournament_weekly_number()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.weekly_number :=
      pg_catalog.nextval(
        'public.tournament_weekly_number_seq'::pg_catalog.regclass
      );
    return new;
  end if;

  if new.weekly_number is distinct from old.weekly_number then
    raise exception using errcode = '42501';
  end if;

  return new;
end;
$$;

create trigger tournaments_assign_weekly_number
before insert on public.tournaments
for each row
execute function public.assign_tournament_weekly_number();

create trigger tournaments_weekly_number_immutable
before update of weekly_number on public.tournaments
for each row
execute function public.assign_tournament_weekly_number();

revoke all on sequence public.tournament_weekly_number_seq
  from public, anon, authenticated;

revoke all on function public.assign_tournament_weekly_number()
  from public, anon, authenticated;

commit;
