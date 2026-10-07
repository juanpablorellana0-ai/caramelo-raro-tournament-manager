-- Caramelo Raro Tournament Manager
-- Migration 0001: initial schema
--
-- Based strictly on docs/DATABASE.md
--
-- Important:
-- - Participant-facing access is intentionally NOT granted to anon.
-- - Raw poll/update tokens are never stored.
-- - Organizer access is protected by RLS and auth.uid().
-- - Multi-row invariants and state transitions remain server-side concerns.

begin;

-- ============================================================
-- Extensions
-- ============================================================

create extension if not exists pgcrypto;


-- ============================================================
-- Helper functions
-- ============================================================

-- Validate IANA timezone names against PostgreSQL's timezone catalog.
create or replace function public.is_valid_iana_timezone(value text)
returns boolean
language sql
stable
as $$
  select exists (
    select 1
    from pg_timezone_names
    where name = value
  );
$$;


-- ============================================================
-- Organizers
-- ============================================================

create table public.organizers (
  id uuid primary key
    references auth.users(id)
    on delete cascade,

  display_name text not null,

  default_timezone text not null
    check (public.is_valid_iana_timezone(default_timezone)),

  created_at timestamptz not null default now(),

  updated_at timestamptz not null default now()
);


-- ============================================================
-- Tournament templates
-- ============================================================

create table public.tournament_templates (
  id uuid primary key
    default gen_random_uuid(),

  organizer_id uuid not null
    references public.organizers(id)
    on delete cascade,

  name text not null,

  category text not null,

  version integer not null
    check (version > 0),

  rules jsonb not null
    check (jsonb_typeof(rules) = 'object'),

  is_active boolean not null default true,

  created_at timestamptz not null default now(),

  constraint tournament_templates_organizer_id_id_uq
    unique (organizer_id, id),

  constraint tournament_templates_organizer_name_version_uq
    unique (organizer_id, name, version)
);


-- ============================================================
-- Tournaments
-- ============================================================

create table public.tournaments (
  id uuid primary key
    default gen_random_uuid(),

  organizer_id uuid not null
    references public.organizers(id)
    on delete cascade,

  template_id uuid null,

  template_version integer null
    check (template_version is null or template_version > 0),

  title text not null,

  description text null,

  format text not null,

  rules_snapshot jsonb not null
    check (jsonb_typeof(rules_snapshot) = 'object'),

  timezone text not null
    check (public.is_valid_iana_timezone(timezone)),

  status text not null default 'draft'
    check (
      status in (
        'draft',
        'collecting_availability',
        'schedule_approved',
        'announced',
        'completed',
        'cancelled'
      )
    ),

  approved_option_id uuid null,

  approved_at timestamptz null,

  created_at timestamptz not null default now(),

  updated_at timestamptz not null default now(),

  constraint tournaments_approval_fields_ck
    check (
      (approved_option_id is null and approved_at is null)
      or
      (approved_option_id is not null and approved_at is not null)
    )
);


-- ============================================================
-- Availability options
-- ============================================================

create table public.availability_options (
  id uuid primary key
    default gen_random_uuid(),

  tournament_id uuid not null
    references public.tournaments(id)
    on delete cascade,

  starts_at timestamptz not null,

  ends_at timestamptz not null,

  is_active boolean not null default true,

  created_at timestamptz not null default now(),

  constraint availability_options_time_ck
    check (ends_at > starts_at),

  constraint availability_options_tournament_id_id_uq
    unique (tournament_id, id)
);


-- ============================================================
-- Complete tournament/template relationship
-- ============================================================

alter table public.tournaments
  add constraint tournaments_template_organizer_fk
  foreign key (organizer_id, template_id)
  references public.tournament_templates (organizer_id, id);


-- ============================================================
-- Approved option relationship
-- ============================================================

alter table public.tournaments
  add constraint tournaments_approved_option_fk
  foreign key (id, approved_option_id)
  references public.availability_options (tournament_id, id);


-- ============================================================
-- Polls
-- ============================================================

create table public.polls (
  id uuid primary key
    default gen_random_uuid(),

  tournament_id uuid not null
    references public.tournaments(id)
    on delete cascade,

  public_token_hash bytea not null
    unique
    check (octet_length(public_token_hash) = 32),

  status text not null default 'open'
    check (status in ('open', 'closed')),

  opens_at timestamptz not null,

  closes_at timestamptz null,

  created_at timestamptz not null default now(),

  closed_at timestamptz null,

  constraint polls_tournament_uq
    unique (tournament_id),

  constraint polls_tournament_id_id_uq
    unique (tournament_id, id),

  constraint polls_close_time_ck
    check (
      closes_at is null
      or closes_at > opens_at
    ),

  constraint polls_closed_at_status_ck
    check (
      (status = 'open' and closed_at is null)
      or
      (status = 'closed' and closed_at is not null)
    )
);


-- ============================================================
-- Participant responses
-- ============================================================

create table public.participant_responses (
  id uuid primary key
    default gen_random_uuid(),

  poll_id uuid not null
    references public.polls(id)
    on delete cascade,

  tournament_id uuid not null,

  update_token_hash bytea not null
    unique
    check (octet_length(update_token_hash) = 32),

  display_name text null,

  submitted_at timestamptz not null default now(),

  updated_at timestamptz not null default now(),

  constraint participant_responses_tournament_id_id_uq
    unique (tournament_id, id),

  constraint participant_responses_poll_token_uq
    unique (poll_id, update_token_hash),

  constraint participant_responses_poll_tournament_fk
    foreign key (tournament_id, poll_id)
    references public.polls (tournament_id, id)
    on delete cascade
);


-- ============================================================
-- Availability selections
-- ============================================================

create table public.availability_selections (
  tournament_id uuid not null,

  response_id uuid not null,

  availability_option_id uuid not null,

  created_at timestamptz not null default now(),

  primary key (response_id, availability_option_id),

  constraint availability_selections_response_fk
    foreign key (tournament_id, response_id)
    references public.participant_responses (tournament_id, id)
    on delete cascade,

  constraint availability_selections_option_fk
    foreign key (tournament_id, availability_option_id)
    references public.availability_options (tournament_id, id)
    on delete cascade
);


-- ============================================================
-- Message drafts
-- ============================================================

create table public.message_drafts (
  id uuid primary key
    default gen_random_uuid(),

  tournament_id uuid not null
    references public.tournaments(id)
    on delete cascade,

  kind text not null
    check (kind in ('invitation', 'final_announcement')),

  version integer not null
    check (version > 0),

  content text not null,

  approved_by uuid null
    references public.organizers(id),

  approved_at timestamptz null,

  created_at timestamptz not null default now(),

  updated_at timestamptz not null default now(),

  constraint message_drafts_tournament_kind_version_uq
    unique (tournament_id, kind, version),

  constraint message_drafts_approval_fields_ck
    check (
      (approved_by is null and approved_at is null)
      or
      (approved_by is not null and approved_at is not null)
    )
);


-- ============================================================
-- Manual tasks
-- ============================================================

create table public.manual_tasks (
  id uuid primary key
    default gen_random_uuid(),

  tournament_id uuid not null
    references public.tournaments(id)
    on delete cascade,

  title text not null,

  details text null,

  status text not null default 'pending'
    check (
      status in (
        'pending',
        'completed',
        'cancelled'
      )
    ),

  assigned_to uuid null
    references public.organizers(id),

  created_at timestamptz not null default now(),

  completed_at timestamptz null,

  constraint manual_tasks_completion_ck
    check (
      (status = 'completed' and completed_at is not null)
      or
      (status <> 'completed' and completed_at is null)
    )
);


-- ============================================================
-- Tournament status events
-- ============================================================

create table public.tournament_status_events (
  id uuid primary key
    default gen_random_uuid(),

  tournament_id uuid not null
    references public.tournaments(id)
    on delete cascade,

  from_status text null
    check (
      from_status is null
      or from_status in (
        'draft',
        'collecting_availability',
        'schedule_approved',
        'announced',
        'completed',
        'cancelled'
      )
    ),

  to_status text not null
    check (
      to_status in (
        'draft',
        'collecting_availability',
        'schedule_approved',
        'announced',
        'completed',
        'cancelled'
      )
    ),

  changed_by uuid null
    references public.organizers(id),

  note text null,

  created_at timestamptz not null default now()
);


-- ============================================================
-- Indexes
-- ============================================================

create index tournament_templates_organizer_active_name_idx
  on public.tournament_templates (
    organizer_id,
    is_active,
    name
  );

create index tournaments_organizer_updated_idx
  on public.tournaments (
    organizer_id,
    updated_at desc
  );

create index tournaments_organizer_status_updated_idx
  on public.tournaments (
    organizer_id,
    status,
    updated_at desc
  );

create index availability_options_tournament_starts_active_idx
  on public.availability_options (
    tournament_id,
    starts_at
  )
  where is_active;

create index participant_responses_poll_submitted_idx
  on public.participant_responses (
    poll_id,
    submitted_at desc
  );

create index availability_selections_tournament_option_idx
  on public.availability_selections (
    tournament_id,
    availability_option_id
  );

create index message_drafts_tournament_kind_version_idx
  on public.message_drafts (
    tournament_id,
    kind,
    version desc
  );

create index manual_tasks_tournament_status_created_idx
  on public.manual_tasks (
    tournament_id,
    status,
    created_at
  );

create index tournament_status_events_tournament_created_idx
  on public.tournament_status_events (
    tournament_id,
    created_at desc
  );


-- ============================================================
-- Row Level Security
-- ============================================================

alter table public.organizers enable row level security;
alter table public.tournament_templates enable row level security;
alter table public.tournaments enable row level security;
alter table public.availability_options enable row level security;
alter table public.polls enable row level security;
alter table public.participant_responses enable row level security;
alter table public.availability_selections enable row level security;
alter table public.message_drafts enable row level security;
alter table public.manual_tasks enable row level security;
alter table public.tournament_status_events enable row level security;


-- ============================================================
-- Organizer policies
-- ============================================================

create policy "organizers_select_own"
on public.organizers
for select
to authenticated
using (id = auth.uid());

create policy "organizers_insert_own"
on public.organizers
for insert
to authenticated
with check (id = auth.uid());

create policy "organizers_update_own"
on public.organizers
for update
to authenticated
using (id = auth.uid())
with check (id = auth.uid());


-- ============================================================
-- Tournament templates policies
-- ============================================================

create policy "templates_select_own"
on public.tournament_templates
for select
to authenticated
using (
  organizer_id = auth.uid()
);

create policy "templates_insert_own"
on public.tournament_templates
for insert
to authenticated
with check (
  organizer_id = auth.uid()
);

create policy "templates_update_own"
on public.tournament_templates
for update
to authenticated
using (
  organizer_id = auth.uid()
)
with check (
  organizer_id = auth.uid()
);

create policy "templates_delete_own"
on public.tournament_templates
for delete
to authenticated
using (
  organizer_id = auth.uid()
);


-- ============================================================
-- Tournament policies
-- ============================================================

create policy "tournaments_select_own"
on public.tournaments
for select
to authenticated
using (
  organizer_id = auth.uid()
);

create policy "tournaments_insert_own"
on public.tournaments
for insert
to authenticated
with check (
  organizer_id = auth.uid()
);

create policy "tournaments_update_own"
on public.tournaments
for update
to authenticated
using (
  organizer_id = auth.uid()
)
with check (
  organizer_id = auth.uid()
);

create policy "tournaments_delete_own"
on public.tournaments
for delete
to authenticated
using (
  organizer_id = auth.uid()
);


-- ============================================================
-- Availability options policies
-- ============================================================

create policy "availability_options_select_own"
on public.availability_options
for select
to authenticated
using (
  exists (
    select 1
    from public.tournaments t
    where t.id = availability_options.tournament_id
      and t.organizer_id = auth.uid()
  )
);

create policy "availability_options_insert_own"
on public.availability_options
for insert
to authenticated
with check (
  exists (
    select 1
    from public.tournaments t
    where t.id = availability_options.tournament_id
      and t.organizer_id = auth.uid()
  )
);

create policy "availability_options_update_own"
on public.availability_options
for update
to authenticated
using (
  exists (
    select 1
    from public.tournaments t
    where t.id = availability_options.tournament_id
      and t.organizer_id = auth.uid()
  )
)
with check (
  exists (
    select 1
    from public.tournaments t
    where t.id = availability_options.tournament_id
      and t.organizer_id = auth.uid()
  )
);

create policy "availability_options_delete_own"
on public.availability_options
for delete
to authenticated
using (
  exists (
    select 1
    from public.tournaments t
    where t.id = availability_options.tournament_id
      and t.organizer_id = auth.uid()
  )
);


-- ============================================================
-- Poll policies
-- ============================================================

create policy "polls_select_own"
on public.polls
for select
to authenticated
using (
  exists (
    select 1
    from public.tournaments t
    where t.id = polls.tournament_id
      and t.organizer_id = auth.uid()
  )
);

create policy "polls_insert_own"
on public.polls
for insert
to authenticated
with check (
  exists (
    select 1
    from public.tournaments t
    where t.id = polls.tournament_id
      and t.organizer_id = auth.uid()
  )
);

create policy "polls_update_own"
on public.polls
for update
to authenticated
using (
  exists (
    select 1
    from public.tournaments t
    where t.id = polls.tournament_id
      and t.organizer_id = auth.uid()
  )
)
with check (
  exists (
    select 1
    from public.tournaments t
    where t.id = polls.tournament_id
      and t.organizer_id = auth.uid()
  )
);

create policy "polls_delete_own"
on public.polls
for delete
to authenticated
using (
  exists (
    select 1
    from public.tournaments t
    where t.id = polls.tournament_id
      and t.organizer_id = auth.uid()
  )
);


-- ============================================================
-- Participant response policies
-- ============================================================
-- No anon policies.
-- Organizer can inspect responses belonging to their tournaments.

create policy "participant_responses_select_own"
on public.participant_responses
for select
to authenticated
using (
  exists (
    select 1
    from public.tournaments t
    where t.id = participant_responses.tournament_id
      and t.organizer_id = auth.uid()
  )
);

create policy "participant_responses_insert_own"
on public.participant_responses
for insert
to authenticated
with check (
  exists (
    select 1
    from public.tournaments t
    where t.id = participant_responses.tournament_id
      and t.organizer_id = auth.uid()
  )
);

create policy "participant_responses_update_own"
on public.participant_responses
for update
to authenticated
using (
  exists (
    select 1
    from public.tournaments t
    where t.id = participant_responses.tournament_id
      and t.organizer_id = auth.uid()
  )
)
with check (
  exists (
    select 1
    from public.tournaments t
    where t.id = participant_responses.tournament_id
      and t.organizer_id = auth.uid()
  )
);

create policy "participant_responses_delete_own"
on public.participant_responses
for delete
to authenticated
using (
  exists (
    select 1
    from public.tournaments t
    where t.id = participant_responses.tournament_id
      and t.organizer_id = auth.uid()
  )
);


-- ============================================================
-- Availability selections policies
-- ============================================================

create policy "availability_selections_select_own"
on public.availability_selections
for select
to authenticated
using (
  exists (
    select 1
    from public.tournaments t
    where t.id = availability_selections.tournament_id
      and t.organizer_id = auth.uid()
  )
);

create policy "availability_selections_insert_own"
on public.availability_selections
for insert
to authenticated
with check (
  exists (
    select 1
    from public.tournaments t
    where t.id = availability_selections.tournament_id
      and t.organizer_id = auth.uid()
  )
);

create policy "availability_selections_update_own"
on public.availability_selections
for update
to authenticated
using (
  exists (
    select 1
    from public.tournaments t
    where t.id = availability_selections.tournament_id
      and t.organizer_id = auth.uid()
  )
)
with check (
  exists (
    select 1
    from public.tournaments t
    where t.id = availability_selections.tournament_id
      and t.organizer_id = auth.uid()
  )
);

create policy "availability_selections_delete_own"
on public.availability_selections
for delete
to authenticated
using (
  exists (
    select 1
    from public.tournaments t
    where t.id = availability_selections.tournament_id
      and t.organizer_id = auth.uid()
  )
);


-- ============================================================
-- Message drafts policies
-- ============================================================

create policy "message_drafts_select_own"
on public.message_drafts
for select
to authenticated
using (
  exists (
    select 1
    from public.tournaments t
    where t.id = message_drafts.tournament_id
      and t.organizer_id = auth.uid()
  )
);

create policy "message_drafts_insert_own"
on public.message_drafts
for insert
to authenticated
with check (
  exists (
    select 1
    from public.tournaments t
    where t.id = message_drafts.tournament_id
      and t.organizer_id = auth.uid()
  )
);

create policy "message_drafts_update_own"
on public.message_drafts
for update
to authenticated
using (
  exists (
    select 1
    from public.tournaments t
    where t.id = message_drafts.tournament_id
      and t.organizer_id = auth.uid()
  )
)
with check (
  exists (
    select 1
    from public.tournaments t
    where t.id = message_drafts.tournament_id
      and t.organizer_id = auth.uid()
  )
);

create policy "message_drafts_delete_own"
on public.message_drafts
for delete
to authenticated
using (
  exists (
    select 1
    from public.tournaments t
    where t.id = message_drafts.tournament_id
      and t.organizer_id = auth.uid()
  )
);


-- ============================================================
-- Manual tasks policies
-- ============================================================

create policy "manual_tasks_select_own"
on public.manual_tasks
for select
to authenticated
using (
  exists (
    select 1
    from public.tournaments t
    where t.id = manual_tasks.tournament_id
      and t.organizer_id = auth.uid()
  )
);

create policy "manual_tasks_insert_own"
on public.manual_tasks
for insert
to authenticated
with check (
  exists (
    select 1
    from public.tournaments t
    where t.id = manual_tasks.tournament_id
      and t.organizer_id = auth.uid()
  )
);

create policy "manual_tasks_update_own"
on public.manual_tasks
for update
to authenticated
using (
  exists (
    select 1
    from public.tournaments t
    where t.id = manual_tasks.tournament_id
      and t.organizer_id = auth.uid()
  )
)
with check (
  exists (
    select 1
    from public.tournaments t
    where t.id = manual_tasks.tournament_id
      and t.organizer_id = auth.uid()
  )
);

create policy "manual_tasks_delete_own"
on public.manual_tasks
for delete
to authenticated
using (
  exists (
    select 1
    from public.tournaments t
    where t.id = manual_tasks.tournament_id
      and t.organizer_id = auth.uid()
  )
);


-- ============================================================
-- Tournament status events policies
-- ============================================================
-- No UPDATE/DELETE policies: events are append-only.

create policy "status_events_select_own"
on public.tournament_status_events
for select
to authenticated
using (
  exists (
    select 1
    from public.tournaments t
    where t.id = tournament_status_events.tournament_id
      and t.organizer_id = auth.uid()
  )
);

create policy "status_events_insert_own"
on public.tournament_status_events
for insert
to authenticated
with check (
  exists (
    select 1
    from public.tournaments t
    where t.id = tournament_status_events.tournament_id
      and t.organizer_id = auth.uid()
  )
);


-- ============================================================
-- Explicitly remove anonymous direct table access
-- ============================================================

revoke all on table
  public.organizers,
  public.tournament_templates,
  public.tournaments,
  public.availability_options,
  public.polls,
  public.participant_responses,
  public.availability_selections,
  public.message_drafts,
  public.manual_tasks,
  public.tournament_status_events
from anon;


-- ============================================================
-- Authenticated grants
-- ============================================================
-- RLS remains the actual row-level protection.

grant select, insert, update, delete
on public.organizers
to authenticated;

grant select, insert, update, delete
on public.tournament_templates
to authenticated;

grant select, insert, update, delete
on public.tournaments
to authenticated;

grant select, insert, update, delete
on public.availability_options
to authenticated;

grant select, insert, update, delete
on public.polls
to authenticated;

grant select, insert, update, delete
on public.participant_responses
to authenticated;

grant select, insert, update, delete
on public.availability_selections
to authenticated;

grant select, insert, update, delete
on public.message_drafts
to authenticated;

grant select, insert, update, delete
on public.manual_tasks
to authenticated;

grant select, insert
on public.tournament_status_events
to authenticated;


commit;