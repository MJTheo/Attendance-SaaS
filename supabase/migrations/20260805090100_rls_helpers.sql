-- Helper functions used by RLS policies.
--
-- These live in a separate `app` schema (not `public`) so PostgREST never
-- auto-exposes them as REST endpoints.
--
-- They're SECURITY DEFINER so a policy on `users` can look up the calling
-- user's own row without recursing back into the `users` RLS policy it's
-- part of. `search_path = ''` plus fully-qualified names closes the usual
-- SECURITY DEFINER search-path-hijack hole.

create schema if not exists app;

create or replace function app.current_org_id()
returns uuid
language sql
security definer
stable
set search_path = ''
as $$
  select org_id from public.users where id = auth.uid();
$$;

create or replace function app.is_admin()
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
  select exists (
    select 1 from public.users where id = auth.uid() and role = 'admin'
  );
$$;

revoke all on function app.current_org_id() from public;
revoke all on function app.is_admin() from public;
grant execute on function app.current_org_id() to authenticated;
grant execute on function app.is_admin() to authenticated;
