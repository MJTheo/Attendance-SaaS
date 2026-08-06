-- Row-level security: tenant isolation + role scoping for every tenant-scoped table.
--
-- Note on org/first-admin creation: there is intentionally no INSERT policy on
-- `organizations`, and the only INSERT policy on `users` requires an existing
-- admin. Bootstrapping a brand-new org + its first admin user therefore has to
-- go through the backend's service-role client (bypasses RLS), not a direct
-- client-side Supabase call. That's a deliberate gap, not an oversight.

-- ---------- organizations ----------

alter table organizations enable row level security;
revoke all on organizations from anon;
grant select, update on organizations to authenticated;

create policy "members can view their organization"
on organizations for select
to authenticated
using (id = app.current_org_id());

create policy "admins can update their organization"
on organizations for update
to authenticated
using (id = app.current_org_id() and app.is_admin())
with check (id = app.current_org_id() and app.is_admin());

-- ---------- users ----------

alter table users enable row level security;
revoke all on users from anon;
grant select, insert, update on users to authenticated;

create policy "members can view users in their org"
on users for select
to authenticated
using (org_id = app.current_org_id());

create policy "admins can add users to their org"
on users for insert
to authenticated
with check (org_id = app.current_org_id() and app.is_admin());

create policy "admins can update users in their org"
on users for update
to authenticated
using (org_id = app.current_org_id() and app.is_admin())
with check (org_id = app.current_org_id() and app.is_admin());

-- ---------- attendance_records ----------
-- No admin UPDATE policy at all, on purpose: admins editing an attendance record
-- directly would be a silent edit. Every non-clock-in/out change has to flow
-- through `corrections`, applied by the backend's service-role client. See the
-- clock-out-only guard trigger in the next migration for the enforcement on the
-- one UPDATE path staff do have.

alter table attendance_records enable row level security;
revoke all on attendance_records from anon;
grant select, insert, update on attendance_records to authenticated;

create policy "staff can view their own attendance records"
on attendance_records for select
to authenticated
using (org_id = app.current_org_id() and user_id = auth.uid());

create policy "admins can view all attendance records in their org"
on attendance_records for select
to authenticated
using (org_id = app.current_org_id() and app.is_admin());

create policy "staff can clock in for themselves"
on attendance_records for insert
to authenticated
with check (org_id = app.current_org_id() and user_id = auth.uid());

create policy "staff can clock out their own open record"
on attendance_records for update
to authenticated
using (org_id = app.current_org_id() and user_id = auth.uid() and clock_out is null)
with check (org_id = app.current_org_id() and user_id = auth.uid());

-- ---------- corrections ----------
-- Immutable audit trail: no DELETE policy for anyone.

alter table corrections enable row level security;
revoke all on corrections from anon;
grant select, insert, update on corrections to authenticated;

create policy "staff can view their own correction requests"
on corrections for select
to authenticated
using (org_id = app.current_org_id() and requested_by = auth.uid());

create policy "admins can view all corrections in their org"
on corrections for select
to authenticated
using (org_id = app.current_org_id() and app.is_admin());

create policy "staff can request a correction on their own attendance record"
on corrections for insert
to authenticated
with check (
  org_id = app.current_org_id()
  and requested_by = auth.uid()
  and status = 'pending'
  and approved_by is null
  and exists (
    select 1 from attendance_records ar
    where ar.id = attendance_record_id
      and ar.org_id = app.current_org_id()
      and ar.user_id = auth.uid()
  )
);

create policy "admins can resolve pending corrections in their org"
on corrections for update
to authenticated
using (org_id = app.current_org_id() and app.is_admin() and status = 'pending')
with check (org_id = app.current_org_id() and app.is_admin());

-- ---------- reports ----------
-- No INSERT/UPDATE policy for anyone: reports are only ever written by the
-- APScheduler job via the service-role client.

alter table reports enable row level security;
revoke all on reports from anon;
grant select on reports to authenticated;

create policy "admins can view reports in their org"
on reports for select
to authenticated
using (org_id = app.current_org_id() and app.is_admin());
