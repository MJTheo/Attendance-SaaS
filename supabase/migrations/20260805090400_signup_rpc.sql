-- Atomic org + first-admin provisioning, called by the backend's service-role
-- client during signup.
--
-- Lives in `public` (not `app`) on purpose: PostgREST only exposes `public`
-- by default, and this function has to be reachable via supabase-py's
-- `.rpc()`, which is an HTTP call through PostgREST. EXECUTE is restricted to
-- service_role below, so even though the route exists, calling it with the
-- anon/authenticated key still gets rejected by Postgres — only the backend's
-- service-role client can actually run it.

create or replace function public.create_organization_with_admin(
  org_name text,
  admin_id uuid,
  admin_name text,
  admin_email text
)
returns table (org_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  new_org_id uuid;
begin
  insert into public.organizations (name)
  values (org_name)
  returning id into new_org_id;

  insert into public.users (id, org_id, role, name, email)
  values (admin_id, new_org_id, 'admin', admin_name, admin_email);

  return query select new_org_id;
end;
$$;

revoke all on function public.create_organization_with_admin(text, uuid, text, text) from public;
grant execute on function public.create_organization_with_admin(text, uuid, text, text) to service_role;
