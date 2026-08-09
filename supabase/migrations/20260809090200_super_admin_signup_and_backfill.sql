-- New orgs: whoever signs up and creates the org becomes its first super
-- admin, not just an admin — otherwise a brand-new org would have zero
-- super admins and nobody could ever promote anyone (users_role_change_guard,
-- from the previous migration, only lets a super admin change a role).

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
  values (admin_id, new_org_id, 'super_admin', admin_name, admin_email);

  return query select new_org_id;
end;
$$;

-- Existing orgs (created before super_admin existed) would otherwise be
-- stuck at zero super admins forever — promote every current admin so each
-- org keeps at least one and can start using the role-management UI.
update public.users set role = 'super_admin' where role = 'admin';
