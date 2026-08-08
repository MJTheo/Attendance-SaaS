-- Sick/annual leave, as a full request-and-approval workflow mirroring
-- `corrections`: staff request, admin approves/rejects, immutable audit
-- trail. Deliberately its own table rather than new attendance_status
-- values — a leave day isn't a clock-in event, it's the absence of one.

create type leave_type as enum ('sick', 'annual');
create type leave_status as enum ('pending', 'approved', 'rejected');

create table leave_requests (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  leave_type leave_type not null,
  start_date date not null,
  end_date date not null,
  reason text not null,
  status leave_status not null default 'pending',
  requested_by uuid not null references users(id),
  approved_by uuid references users(id),
  created_at timestamptz not null default now(),
  resolved_at timestamptz,
  constraint leave_requests_date_range check (end_date >= start_date)
);
create index leave_requests_org_id_idx on leave_requests(org_id);
create index leave_requests_user_id_idx on leave_requests(user_id);
create index leave_requests_org_dates_idx on leave_requests(org_id, start_date, end_date);

-- ---------- RLS ----------
-- Same shape as corrections: immutable audit trail, no DELETE policy for anyone.

alter table leave_requests enable row level security;
revoke all on leave_requests from anon;
grant select, insert, update on leave_requests to authenticated;

create policy "staff can view their own leave requests"
on leave_requests for select
to authenticated
using (org_id = app.current_org_id() and requested_by = auth.uid());

create policy "admins can view all leave requests in their org"
on leave_requests for select
to authenticated
using (org_id = app.current_org_id() and app.is_admin());

create policy "staff can request leave for themselves"
on leave_requests for insert
to authenticated
with check (
  org_id = app.current_org_id()
  and requested_by = auth.uid()
  and user_id = auth.uid()
  and status = 'pending'
  and approved_by is null
);

create policy "admins can resolve pending leave requests in their org"
on leave_requests for update
to authenticated
using (org_id = app.current_org_id() and app.is_admin() and status = 'pending')
with check (org_id = app.current_org_id() and app.is_admin());
