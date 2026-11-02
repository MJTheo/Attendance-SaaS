-- Column-level guard on organizations, for the Company page.
--
-- The "admins can update their organization" RLS policy is row-level: any
-- admin (and, via the widened app.is_admin(), any super admin) can rewrite
-- any column on their own org row directly through PostgREST, regardless of
-- what the backend's routes allow. That was fine while working_days and
-- timezone were the only editable columns, but two columns need tighter
-- rules than "any admin":
--
--   * name — renaming the org is super-admin-only (Company page). The
--     backend gates PATCH /admin/organization with require_super_admin; this
--     makes the DB enforce it too, same as users_role_change_guard does for
--     roles.
--   * plan — no end user should ever change it (it's billing state, and
--     'demo' is what marks the shared public demo org read-only for invites
--     and renames). Before this trigger any admin could rewrite it directly.
--     Plan changes are service-role only.
--
-- Same shape as app.enforce_role_change_guard(): only fires for real
-- end-user sessions (auth.role() = 'authenticated'), never for the backend's
-- service-role client, and deliberately not SECURITY DEFINER so auth.uid()
-- inside app.is_super_admin() resolves to the caller. Needs USAGE on schema
-- app, already granted by 20260809110000_app_schema_usage_grant.sql.

create or replace function app.enforce_organizations_column_guard()
returns trigger
language plpgsql
as $$
begin
  if auth.role() = 'authenticated' then
    if new.plan is distinct from old.plan then
      raise exception 'organizations: plan can only be changed by the service';
    end if;

    if new.name is distinct from old.name and not app.is_super_admin() then
      raise exception 'organizations: only a super admin can rename the organization';
    end if;
  end if;

  return new;
end;
$$;

create trigger organizations_column_guard
before update on organizations
for each row execute function app.enforce_organizations_column_guard();
