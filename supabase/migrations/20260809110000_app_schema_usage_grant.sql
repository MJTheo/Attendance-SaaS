-- Fixes users_role_change_guard failing with "permission denied for schema
-- app" (42501) whenever it actually took the role-change branch.
--
-- RLS policies that reference app.is_admin()/app.current_org_id() have
-- worked without this grant because a policy's expression is resolved to a
-- fixed function OID at CREATE POLICY time (by the table owner, who has
-- full access) and only needs EXECUTE on that function at runtime. A
-- plpgsql function's body, by contrast, resolves its own identifiers under
-- the CALLING role — here, authenticated, since enforce_role_change_guard
-- is deliberately not SECURITY DEFINER (see its comment) — and that lookup
-- needs USAGE on any schema it references, which was never explicitly
-- granted; only EXECUTE on each individual function was. This is the first
-- trigger in the codebase to call an app.* helper from its body, which is
-- why the gap was invisible until now.

grant usage on schema app to authenticated;
