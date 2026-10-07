# MVP Database Design

## Scope and design decisions

This document describes the Supabase PostgreSQL schema used by the MVP in [MVP.md](./MVP.md). The migrations in `supabase/migrations/` are authoritative; apply `0001_initial_schema.sql` followed by `0002_anonymous_availability_poll.sql`.

- There is one organizer account in v0.1. Organizer-owned rows reference that user's Supabase Auth UUID. The schema leaves room for additional organizers, but the MVP must not grant them access by default.
- Participants do not have accounts. A public poll token grants access to the poll. A separate random browser token identifies one response per poll, and only its SHA-256 hash is stored. Neither token is an identity or proof of a real-world person.
- Public availability responses do not collect a name or other personal information. The legacy nullable `display_name` column is unused and is not populated by the public survey.
- Store rule data as structured `jsonb` in templates and copy it to each tournament when created. The tournament copy is authoritative for that tournament's history.
- Store instants as `timestamptz`; store the tournament's IANA timezone separately so local times can be rendered consistently, including daylight-saving transitions.
- Public survey reads and writes go through server-side endpoints or narrowly scoped database functions that validate the poll token. Do not provide anonymous clients direct table access.
- Enforce relational integrity and uniqueness in PostgreSQL. The server additionally validates token possession, input bounds, poll state, and state transitions.

## Relationships

```text
auth.users 1 ── 1 organizers
organizers 1 ── * tournament_templates
organizers 1 ── * tournaments
tournament_templates 1 ── * tournaments
tournaments 1 ── * availability_options
tournaments 1 ── 0..1 polls
polls 1 ── * participant_responses
participant_responses * ── * availability_options
    through availability_selections
tournaments 1 ── * message_drafts
tournaments 1 ── * manual_tasks
tournaments 1 ── * tournament_status_events
```

Every tournament-related child row belongs to exactly one tournament. A poll belongs to one tournament; v0.1 uses at most one poll per tournament. A participant can have one response per poll-update credential and can select each availability option at most once.

## Tables and columns

Types below are PostgreSQL types. `PK`, `FK`, `UQ`, and `NN` mean primary key, foreign key, unique, and not null. Unless stated otherwise, generated identifiers are `uuid` values created with `gen_random_uuid()`, and timestamps are `timestamptz` in UTC.

### `organizers`

One profile per authenticated organizer.

| Column | Type | Constraints / purpose |
|---|---|---|
| `id` | `uuid` | PK; FK to `auth.users(id)` with `ON DELETE CASCADE` |
| `display_name` | `text` | NN; organizer-facing name |
| `default_timezone` | `text` | NN; valid IANA timezone name, such as `America/Santiago` |
| `created_at` | `timestamptz` | NN; defaults to current time |
| `updated_at` | `timestamptz` | NN; defaults to current time |

### `tournament_templates`

Versioned starting points. Editing a template creates a new version rather than changing a version already used by tournaments.

| Column | Type | Constraints / purpose |
|---|---|---|
| `id` | `uuid` | PK |
| `organizer_id` | `uuid` | NN; FK to `organizers(id)` |
| `name` | `text` | NN |
| `category` | `text` | NN; e.g. `VGC` |
| `version` | `integer` | NN; positive version number |
| `rules` | `jsonb` | NN; structured rule defaults, not executable code |
| `is_active` | `boolean` | NN; whether offered for creating new tournaments |
| `created_at` | `timestamptz` | NN |

Constraints: unique `(organizer_id, name, version)` and `(organizer_id, id)`; `version > 0`; `rules` must be a JSON object. Do not update a version's rule contents after use; create a new version.

### `tournaments`

Current tournament configuration, approved date, and lifecycle state. The rules snapshot is independent of future template changes.

| Column | Type | Constraints / purpose |
|---|---|---|
| `id` | `uuid` | PK |
| `organizer_id` | `uuid` | NN; FK to `organizers(id)` |
| `template_id` | `uuid` | FK to `tournament_templates(id)`; nullable if a template is later removed or a tournament is created without one |
| `template_version` | `integer` | Nullable version used at creation; retained as provenance |
| `title` | `text` | NN |
| `description` | `text` | Optional; organizer-approved event description |
| `format` | `text` | NN; e.g. selected Pokémon/VGC format |
| `rules_snapshot` | `jsonb` | NN; immutable copy of the applied rules at creation |
| `timezone` | `text` | NN; valid IANA timezone used to display local times |
| `status` | `text` | NN; one of `draft`, `collecting_availability`, `schedule_approved`, `announced`, `completed`, `cancelled` |
| `approved_option_id` | `uuid` | Nullable; selected option once explicitly approved |
| `approved_at` | `timestamptz` | Nullable; set together with `approved_option_id` |
| `created_at` | `timestamptz` | NN |
| `updated_at` | `timestamptz` | NN |

Constraints: `rules_snapshot` must be a JSON object; `template_version` is positive when present; `approved_option_id` and `approved_at` are both null or both non-null. Composite FK `(organizer_id, template_id)` references `tournament_templates(organizer_id, id)` so a tournament cannot use another organizer's template. A composite FK `(id, approved_option_id)` references `availability_options(tournament_id, id)` so an approved option cannot belong to another tournament. These FKs are nullable when their corresponding ID is null. A server-side transaction must verify that an option is active and the transition to `schedule_approved` is allowed before setting approval fields. The selected option's start/end values are the final schedule; no duplicate scheduled-time fields are needed.

`template_id` records provenance, but `rules_snapshot` is authoritative. Preserve the snapshot even if the template is deactivated or changed.

### `availability_options`

Candidate local dates and times shown on the poll.

| Column | Type | Constraints / purpose |
|---|---|---|
| `id` | `uuid` | PK |
| `tournament_id` | `uuid` | NN; FK to `tournaments(id)` with `ON DELETE CASCADE` |
| `starts_at` | `timestamptz` | NN; unambiguous instant |
| `ends_at` | `timestamptz` | Nullable; reserved for a known end time, not used to estimate tournament duration |
| `is_active` | `boolean` | NN; whether responses may select this option |
| `created_at` | `timestamptz` | NN |

Constraints: unique `(tournament_id, id)` for composite references. Migration 0002 makes `ends_at` nullable and removes the duration check because candidate options represent start times only; do not invent a tournament duration. Options are generated before a poll is created and locked afterward. Render using the tournament's IANA timezone, not the database session timezone.

### `polls`

Public survey lifecycle and token verifier. The raw token is never stored.

| Column | Type | Constraints / purpose |
|---|---|---|
| `id` | `uuid` | PK |
| `tournament_id` | `uuid` | NN; FK to `tournaments(id)`; unique to limit v0.1 to one poll per tournament |
| `public_token_hash` | `bytea` | NN; unique SHA-256 digest of a cryptographically random public token |
| `status` | `text` | NN; `open` or `closed` |
| `opens_at` | `timestamptz` | NN |
| `closes_at` | `timestamptz` | Nullable; if set, must be later than `opens_at` |
| `created_at` | `timestamptz` | NN |
| `closed_at` | `timestamptz` | Nullable; set when closed |

Constraints: unique `tournament_id` and `(tournament_id, id)`; `octet_length(public_token_hash) = 32`; `closes_at > opens_at` when set; `closed_at` is set iff the status is `closed`. The application generates at least 256 bits of entropy, gives the raw token to the organizer for sharing once, and stores only its digest. Never put raw tokens in logs or analytics. A token can be revoked by closing/rotating the poll.

### `participant_responses`

One anonymous participant's current response. A random browser token identifies this response without creating an account.

| Column | Type | Constraints / purpose |
|---|---|---|
| `id` | `uuid` | PK |
| `poll_id` | `uuid` | NN; FK to `polls(id)` with `ON DELETE CASCADE` |
| `tournament_id` | `uuid` | NN; maintained with `poll_id` to enforce that selections belong to the same tournament |
| `participant_token_hash` | `bytea` | NN; SHA-256 digest of the random participant token held in an HttpOnly browser cookie |
| `display_name` | `text` | Nullable legacy column; public submissions leave it null |
| `submitted_at` | `timestamptz` | NN |
| `updated_at` | `timestamptz` | NN |

Constraints: composite FK `(tournament_id, poll_id)` references `polls(tournament_id, id)`; unique `(poll_id, participant_token_hash)`; unique `(tournament_id, id)` for selection references; participant-token hash is 32 bytes. The raw token is held only in that browser's `Secure` (in production), `HttpOnly`, `SameSite` cookie and is never stored in the database or logged. A participant's update replaces the selections transactionally without adding a response.

### `availability_selections`

The current set of options selected by each response. Replace a response's set atomically on update.

| Column | Type | Constraints / purpose |
|---|---|---|
| `tournament_id` | `uuid` | NN; part of composite foreign keys |
| `response_id` | `uuid` | NN; FK with `tournament_id` to `participant_responses(tournament_id, id)` |
| `availability_option_id` | `uuid` | NN; FK with `tournament_id` to `availability_options(tournament_id, id)` |
| `created_at` | `timestamptz` | NN |

Primary key `(response_id, availability_option_id)` prevents duplicate selections. Composite foreign keys prevent selecting an option from a different tournament. The write operation must reject empty selections, inactive options, or closed/expired polls.

### `message_drafts`

Organizer-reviewed invitation and final-announcement text. A draft is not evidence that a message was published.

| Column | Type | Constraints / purpose |
|---|---|---|
| `id` | `uuid` | PK |
| `tournament_id` | `uuid` | NN; FK to `tournaments(id)` with `ON DELETE CASCADE` |
| `kind` | `text` | NN; `invitation` or `final_announcement` |
| `version` | `integer` | NN; positive revision number within a tournament and kind |
| `content` | `text` | NN; generated/edited message text |
| `approved_by` | `uuid` | Nullable; FK to `organizers(id)` |
| `approved_at` | `timestamptz` | Nullable; explicit organizer approval |
| `created_at` | `timestamptz` | NN |
| `updated_at` | `timestamptz` | NN |

Constraints: unique `(tournament_id, kind, version)`; approval actor and timestamp are both null or both non-null. Keep prior revisions when content changes so the history can be consulted. No automated-send or sent status is implied in v0.1.

### `manual_tasks`

External steps, such as posting an approved message or manually registering on Limitless.

| Column | Type | Constraints / purpose |
|---|---|---|
| `id` | `uuid` | PK |
| `tournament_id` | `uuid` | NN; FK to `tournaments(id)` with `ON DELETE CASCADE` |
| `title` | `text` | NN |
| `details` | `text` | Nullable |
| `status` | `text` | NN; `pending`, `completed`, or `cancelled` |
| `assigned_to` | `uuid` | Nullable; FK to `organizers(id)` |
| `created_at` | `timestamptz` | NN |
| `completed_at` | `timestamptz` | Nullable |

Constraints: `completed_at` is non-null iff status is `completed`. Completion is a user-recorded manual action, not proof of an external integration.

### `tournament_status_events`

Append-only record of lifecycle changes for the tournament history.

| Column | Type | Constraints / purpose |
|---|---|---|
| `id` | `uuid` | PK |
| `tournament_id` | `uuid` | NN; FK to `tournaments(id)` with `ON DELETE CASCADE` |
| `from_status` | `text` | Nullable; null only for initial state |
| `to_status` | `text` | NN; valid tournament status |
| `changed_by` | `uuid` | Nullable FK to `organizers(id)`; null for a system-created event |
| `note` | `text` | Nullable; concise organizer explanation |
| `created_at` | `timestamptz` | NN |

The server inserts the event and changes `tournaments.status` in one transaction. Do not update or delete events through normal application paths. Enforce permitted transitions in a server-side operation; a `CHECK` constraint can validate status values but not the transition graph.

## Important indexes

Primary keys and unique constraints create their own indexes. Add these query/supporting indexes:

| Index | Purpose |
|---|---|
| `tournament_templates (organizer_id, is_active, name)` | List active templates for the organizer |
| `tournaments (organizer_id, updated_at DESC)` | Organizer's tournament list and history |
| `tournaments (organizer_id, status, updated_at DESC)` | Filter active/in-progress tournaments |
| `availability_options (tournament_id, starts_at) WHERE is_active` | Render active candidates in chronological order |
| `participant_responses (poll_id, submitted_at DESC)` | Organizer response list and counts |
| `availability_selections (tournament_id, availability_option_id)` | Aggregate availability by candidate |
| `message_drafts (tournament_id, kind, version DESC)` | Retrieve a tournament's latest draft |
| `manual_tasks (tournament_id, status, created_at)` | Show outstanding tasks first |
| `tournament_status_events (tournament_id, created_at DESC)` | Display tournament timeline |

PostgreSQL does not automatically index the referencing side of foreign keys. The indexes above cover common lookups; add others only when query plans and measured usage justify them. The unique indexes on token hashes support exact verifier lookup.

## Row Level Security and API boundaries

Enable RLS on every application table. RLS is defense in depth; all operations still go through the intended server-side paths.

- **Organizer access:** authenticated requests can read/write only rows associated with the UUID in `auth.uid()` and a corresponding `organizers.id`. For child records, scope through their tournament's `organizer_id`; do not trust a client-supplied organizer ID. Do not grant organizer access merely because a user is authenticated.
- **Participant access:** grant the `anon` role no direct `SELECT`, `INSERT`, `UPDATE`, or `DELETE` on these tables. The public page calls server endpoints backed by narrowly scoped `SECURITY DEFINER` functions granted only to `service_role`; raw tokens are hashed server-side and only allowlisted tournament details, active options, and the current browser's own response state are returned.
- **Least privilege:** do not expose the Supabase service-role key to the browser. Service-role operations bypass RLS; keep them server-side, narrow their input, and validate state and ownership explicitly. Prefer narrowly scoped functions with a fixed `search_path` if using database functions.
- **Abuse and leakage controls:** use HTTPS, rate-limit token attempts and submissions, compare token digests safely, avoid logging raw tokens or survey payloads, and set a restrictive `Referrer-Policy` / avoid third-party assets on token-bearing pages. Support closing/rotating the public token.
- **Consistency:** perform response updates (response timestamp and replacement of all selections) atomically. Perform status transition, approval, and history insertion atomically. RLS alone does not enforce these multi-row invariants.

## Sensitive/private information

| Information | Classification and access |
|---|---|
| Raw public poll token | Secret bearer credential. Shown only in the shareable survey URL; never stored in the database, logs, or analytics. Anyone possessing it can access the public survey, not organizer data. |
| Raw participant token | Private browser bearer credential for identifying and updating one response. Never stored in the database or logs; held in an HttpOnly cookie. |
| Token hashes | Sensitive verifier data. Store only server-side; never return through a public query. Hashes of high-entropy random tokens are not intended to replace access controls. |
| Participant display name | Unused legacy column. The public survey does not collect or populate it. |
| Individual response and selections | Private survey information. Organizer-only; public responses must not reveal a participant's identity or individual choices. |
| Organizer identity and authentication UUID | Private account information; organizer-only. Authentication credentials remain managed by Supabase Auth, not duplicated here. |
| Draft messages, task details, status notes | Organizer content, potentially containing unpublished plans. Organizer-only unless the organizer deliberately shares approved text. |
| Tournament rules/configuration and candidate times | May be exposed only in the public poll if intended for participants. Keep drafts and internal notes private; expose only fields approved for the poll. |

Do not add phone numbers, email addresses, IP addresses, or device fingerprints to the participant schema for the MVP. If operational abuse controls temporarily process network metadata, keep them outside participant records, minimize retention, and document the purpose.

## Participant survey: permitted public information

The public survey should expose only:

- A poll's open/closed state and tournament title.
- The participant-facing game, format, relevant rules, timezone, and active candidate start times.
- The current browser's own response status and selected options, so the participant can edit that response.
- A success/updated confirmation for the participant's own submission.

Never expose display names, response IDs, another participant's selections, participant-token hashes, raw or hashed poll credentials, organizer account data, private message drafts, manual task details, or status notes. Do not expose participant identities or answers via guessed UUIDs, direct table APIs, errors, or aggregate drill-down. Availability counts and recommendations are not part of the current public payload. The participant-facing poll payload should be an explicit allowlist, not a serialized database row.

## Duplicate responses and update semantics

An anonymous system cannot reliably prove that two different browsers belong to the same human without introducing identity collection or accounts. This design therefore treats possession of the random participant cookie as continuity of one response:

1. The server creates a 256-bit random participant token on the first poll visit, stores it in a poll-scoped HttpOnly cookie, and stores only its SHA-256 hash with the response on submission.
2. Repeated submissions from that browser resolve to the same response. The unique `(poll_id, participant_token_hash)` constraint prevents a second response for that credential.
3. The server replaces that response's selection set in one transaction. The primary key on `(response_id, availability_option_id)` prevents duplicate option selections, and composite foreign keys prevent cross-tournament selections.
4. The public poll token alone cannot identify or overwrite an existing response. Clearing or losing the browser cookie loses access to that response; without accounts or personal contact details, securely recovering it is not possible.

This prevents a browser retaining its cookie from creating multiple responses for the same poll and supports edits without accounts. A person using another browser/device or clearing the cookie can submit another anonymous response; the system does not use IP addresses or device fingerprints as identity.

## Example records: one VGC weekly tournament

Illustrative values only; UUIDs, token digests, timestamps, rules, and times are examples. Raw token values are deliberately omitted. Tournament-local times are Santiago local time; stored instants are UTC `timestamptz` values.

### Organizer

| id | display_name | default_timezone |
|---|---|---|
| `10000000-0000-4000-8000-000000000001` | `Caramelo Raro Organizer` | `America/Santiago` |

### Template

| id | organizer_id | name | category | version | rules |
|---|---|---|---|---:|---|
| `20000000-0000-4000-8000-000000000001` | `10000000-0000-4000-8000-000000000001` | `VGC weekly singles` | `VGC` | 1 | `{"team_format":"singles","open_team_sheet":true,"best_of":3,"game_format":"organizer-selected"}` |

### Tournament

| id | title | format | timezone | status | template_id | rules_snapshot | approved_option_id |
|---|---|---|---|---|---|---|---|
| `30000000-0000-4000-8000-000000000001` | `Caramelo Raro VGC Weekly — 2026-10-10` | `VGC Regulation Set (organizer-confirmed)` | `America/Santiago` | `collecting_availability` | `20000000-0000-4000-8000-000000000001` | `{"team_format":"singles","open_team_sheet":true,"best_of":3,"game_format":"VGC Regulation Set (organizer-confirmed)"}` | `NULL` |

The snapshot is copied at tournament creation and is not read from the template at survey or history display time.

### Availability options

| id | tournament_id | starts_at (UTC) | ends_at (UTC) | is_active | Local display |
|---|---|---|---|---|---|
| `40000000-0000-4000-8000-000000000001` | `30000000-0000-4000-8000-000000000001` | `2026-10-10 18:00:00+00` | `NULL` | true | Saturday 10 Oct, 15:00 `America/Santiago` |
| `40000000-0000-4000-8000-000000000002` | `30000000-0000-4000-8000-000000000001` | `2026-10-11 18:00:00+00` | `NULL` | true | Sunday 11 Oct, 15:00 `America/Santiago` |

### Poll

| id | tournament_id | public_token_hash (illustrative) | status | opens_at | closes_at |
|---|---|---|---|---|---|
| `50000000-0000-4000-8000-000000000001` | `30000000-0000-4000-8000-000000000001` | `[32-byte SHA-256 digest; not a usable token]` | `open` | `2026-10-01 12:00:00+00` | `2026-10-09 23:59:00+00` |

### Anonymous participant response and selections

| Response id | poll_id | participant_token_hash (illustrative) | display_name | submitted_at |
|---|---|---|---|---|
| `60000000-0000-4000-8000-000000000001` | `50000000-0000-4000-8000-000000000001` | `[32-byte SHA-256 digest; not a usable token]` | `NULL` | `2026-10-02 16:00:00+00` |
| `60000000-0000-4000-8000-000000000002` | `50000000-0000-4000-8000-000000000001` | `[32-byte SHA-256 digest; not a usable token]` | `NULL` | `2026-10-02 17:15:00+00` |

| tournament_id | response_id | availability_option_id |
|---|---|---|
| `30000000-0000-4000-8000-000000000001` | `60000000-0000-4000-8000-000000000001` | `40000000-0000-4000-8000-000000000001` |
| `30000000-0000-4000-8000-000000000001` | `60000000-0000-4000-8000-000000000001` | `40000000-0000-4000-8000-000000000002` |
| `30000000-0000-4000-8000-000000000001` | `60000000-0000-4000-8000-000000000002` | `40000000-0000-4000-8000-000000000002` |

The organizer sees both responses and can derive counts of 1 for the Saturday option and 2 for Sunday. The public page may show only those aggregate counts, never these response rows or names.

### Message draft, manual task, and status event

| Table | Example |
|---|---|
| `message_drafts` | `(tournament_id=30000000-0000-4000-8000-000000000001, kind='invitation', version=1, content='Caramelo Raro VGC weekly…', approved_by=NULL, approved_at=NULL)` |
| `manual_tasks` | `(tournament_id=30000000-0000-4000-8000-000000000001, title='Share approved invitation in the community channel', status='pending', assigned_to=10000000-0000-4000-8000-000000000001, completed_at=NULL)` |
| `tournament_status_events` | `(tournament_id=30000000-0000-4000-8000-000000000001, from_status=NULL, to_status='draft', changed_by=10000000-0000-4000-8000-000000000001, note=NULL)` |
| `tournament_status_events` | `(tournament_id=30000000-0000-4000-8000-000000000001, from_status='draft', to_status='collecting_availability', changed_by=10000000-0000-4000-8000-000000000001, note='Invitation and poll reviewed')` |

The event rows illustrate creation and opening of the poll. The tournament's current `status` is `collecting_availability`; later transitions append events without rewriting this history.
