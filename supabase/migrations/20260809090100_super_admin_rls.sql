-- super_admin sits above admin: everywhere app.is_admin() already gates a
-- policy, a super admin should pass too, so is_admin() is widened rather than
-- duplicating every admin policy for the new role. is_super_admin() is a new,
-- narrower check for the one thing that's super-admin-only so far: changing
-- someone's role.

create or replace function app.is_admin()
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select exists (
    select 1 from public.users where id = auth.uid() and role in ('admin', 'super_admin')
  );
$$;

create or replace function app.is_super_admin()
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select exists (
    select 1 from public.users where id = auth.uid() and role = 'super_admin'
  );
$$;

revoke all on function app.is_super_admin() from public;
grant execute on function app.is_super_admin() to authenticated;

-- The existing "admins can update users in their org" RLS policy is
-- row-level, not column-level — on its own it would let any admin (now
-- including, via the widened is_admin(), anyone who's already a super admin)
-- rewrite the `role` column on any user in the org, including promoting
-- themselves. This trigger closes that gap the same way
-- attendance_records_clockout_guard closes the equivalent one on
-- attendance_records: it only fires for real end-user sessions
-- (auth.role() = 'authenticated'), never for the backend's service-role
-- client, and it enforces two things a row-level policy can't express —
-- only a super admin may change anyone's role, and a super admin may not
-- demote themselves out of the role (so an org can't lock itself out).

create or replace function app.enforce_role_change_guard()
returns trigger
language plpgsql
as $$
begin
  if auth.role() = 'authenticated' and new.role is distinct from old.role then
    if not app.is_super_admin() then
      raise exception 'users: only a super admin can change roles';
    end if;

    if old.id = auth.uid() and old.role = 'super_admin' and new.role is distinct from 'super_admin' then
      raise exception 'users: cannot remove your own super admin role';
    end if;
  end if;

  return new;
end;
$$;

create trigger users_role_change_guard
before update on users
for each row execute function app.enforce_role_change_guard();
