# caramelo-raro-tournament-manager

## Supabase setup

Copy `.env.example` to `.env.local` and set the Supabase project URL and anon key.
Set `SUPABASE_SERVICE_ROLE_KEY` to the project's service-role key in the server
environment only; never expose it as a `NEXT_PUBLIC_*` variable or in browser code.

Apply migrations `0001` through `0008` in numerical order. Migration `0008`
restricts direct tournament inserts/updates to non-transition columns, moves
state transitions behind owner-validating RPCs, prevents direct status-event
inserts, and closes public polls when a schedule is approved. It also updates
the public poll response with a closure reason. Do not assume migrations in the
repository have been applied to a remote Supabase project; verify its migration
history separately.

The public survey uses server-only Supabase functions; it does not grant the
`anon` role direct access to tournament, poll, response, or availability tables.

Availability results are read through the authenticated organizer's RLS-scoped
server endpoint. Recommendations count each response at most once per selected
option and resolve ties by local start time, date, then option ID. Approval is
always an explicit organizer action and does not announce the tournament.

Run the application with `npm run dev` and check types with `npm run typecheck`.

## Community logo proposal

The app shell has a replaceable logo slot, but logo uploads are not implemented.
A small future implementation can use a `community_branding` row keyed by
`organizer_id` to store a logo object path, plus a Supabase Storage bucket
restricted to PNG, JPEG, and WEBP with a size limit. Upload policies should
require an authenticated organizer and an object path scoped to that organizer;
the branding row should remain owner-writable through RLS. If the logo is shown
on public poll pages, serve it from a public-read bucket while keeping uploads
owner-restricted. Add the table, bucket configuration, policies, and storage
limits in a later reviewed migration; never use the service-role key in the
browser.