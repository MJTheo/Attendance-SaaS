-- Approval-gated profile edits (name, email), as a third instance of the
-- request/approval pattern after corrections and leave_requests: the user
-- requests, an admin approves/rejects, and the row is an immutable audit
-- trail (old_value/new_value, who requested, who approved, when).
--
-- How each field takes effect once approved:
--   * name  — the backend applies it with the service-role client, the same
--             way an approved correction is applied to attendance_records.
--   * email — the login email lives in Supabase Auth (auth.users). Approval
--             only unlocks the change; the user then asks Supabase to send a
--             confirmation link to the new address, and the login switches
--             when they click it. sync_user_email_from_auth (below) copies
--             the confirmed address into public.users.

create type profile_edit_status as enum ('pending', 'approved', 'rejected');

create table profile_edit_requests (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  requested_by uuid not null references users(id),
  approved_by uuid references users(id),
  reason text not null,
  old_value jsonb not null,
  new_value jsonb not null,
  status profile_edit_status not null default 'pending',
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);
create index profile_edit_requests_org_id_idx on profile_edit_requests(org_id);
-- One open request per person at a time, so an approval can never apply a
-- stale old_value over a newer pending change.
create unique index profile_edit_requests_one_pending_per_user
  on profile_edit_requests(user_id) where status = 'pending';

-- ---------- RLS ----------
-- Same shape as corrections/leave: no DELETE policy for anyone.

alter table profile_edit_requests enable row level security;
revoke all on profile_edit_requests from anon;
grant select, insert, update on profile_edit_requests to authenticated;

create policy "members can view their own profile edit requests"
on profile_edit_requests for select
to authenticated
using (org_id = app.current_org_id() and user_id = auth.uid());

create policy "admins can view all profile edit requests in their org"
on profile_edit_requests for select
to authenticated
using (org_id = app.current_org_id() and app.is_admin());

create policy "members can request edits to their own profile"
on profile_edit_requests for insert
to authenticated
with check (
  org_id = app.current_org_id()
  and user_id = auth.uid()
  and requested_by = auth.uid()
  and status = 'pending'
  and approved_by is null
);

-- Nobody resolves their own request — every profile change has a second
-- person in the audit trail — unless they're the org's only admin-level
-- member, who would otherwise never be able to change their own profile.
create or replace function app.can_resolve_profile_edit(requester uuid)
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select requester <> auth.uid()
    or (
      select count(*) from public.users
      where org_id = app.current_org_id() and role in ('admin', 'super_admin')
    ) = 1;
$$;

revoke all on function app.can_resolve_profile_edit(uuid) from public;
grant execute on function app.can_resolve_profile_edit(uuid) to authenticated;

create policy "admins can resolve pending profile edit requests in their org"
on profile_edit_requests for update
to authenticated
using (
  org_id = app.current_org_id() and app.is_admin() and status = 'pending'
  and app.can_resolve_profile_edit(requested_by)
)
with check (org_id = app.current_org_id() and app.is_admin());

-- ---------- users: name/email only change through an approved request ----------
-- The "admins can update users in their org" policy is row-level, so on its
-- own it lets any admin rewrite anyone's name or email (their own included)
-- straight through PostgREST, skipping approval. Same fix as
-- users_role_change_guard: a trigger that only fires for real end-user
-- sessions. The backend's service-role client (applying an approved name)
-- and Supabase Auth's own connection (syncing a confirmed email) don't run
-- as 'authenticated', so they pass.

create or replace function app.enforce_profile_fields_guard()
returns trigger
language plpgsql
as $$
begin
  if auth.role() = 'authenticated'
     and (new.name is distinct from old.name or new.email is distinct from old.email) then
    raise exception 'users: name and email change only through an approved profile edit request';
  end if;
  return new;
end;
$$;

create trigger users_profile_fields_guard
before update on users
for each row execute function app.enforce_profile_fields_guard();

-- ---------- keep public.users.email in step with the real login ----------
-- auth.users is the source of truth for the login email. When it changes —
-- normally because the user clicked an approved change's confirmation link —
-- mirror it here. Note this can't make the auth-level change itself
-- approval-gated: Supabase lets any signed-in user call auth.updateUser()
-- directly. What it does guarantee is that such a change shows up in the app
-- instead of public.users silently going stale.

create or replace function public.sync_user_email_from_auth()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.users set email = new.email where id = new.id and email is distinct from new.email;
  return new;
end;
$$;

create trigger on_auth_user_email_changed
after update of email on auth.users
for each row
when (old.email is distinct from new.email)
execute function public.sync_user_email_from_auth();
