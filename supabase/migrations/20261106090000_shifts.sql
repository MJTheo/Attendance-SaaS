-- Shift times, so a clock-in can be judged late and a clock-out early.
--
-- Part 1 of 2, safe to apply BEFORE the backend that uses it: only new
-- tables and a new enum value, nothing the current backend touches. Part 2
-- (20261106090100_attendance_writes_via_api.sql) removes staff's direct
-- writes to attendance_records and must wait until that backend is live.
--
-- Admins and super admins choose, per person, either a named shift template
-- ("Day 08:00–17:00", reusable across people) or custom start/end times. No
-- assignment row means no shift: that person's clock-ins stay `present` and
-- the closeout job never marks them absent, exactly as before.
--
-- Shifts are same-day only (end after start); night shifts that cross
-- midnight need a "shift date" separate from the calendar day and are a
-- follow-up. Assignments keep current state only — a status is computed when
-- the clock-in/out happens, so changing someone's shift never recomputes past
-- records (architecture rule 2).

create table shift_templates (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  name text not null check (length(trim(name)) between 1 and 60),
  start_time time not null,
  end_time time not null,
  created_at timestamptz not null default now(),
  constraint shift_templates_same_day check (end_time > start_time),
  constraint shift_templates_unique_name unique (org_id, name)
);
create index shift_templates_org_id_idx on shift_templates(org_id);

create table shift_assignments (
  user_id uuid primary key references users(id) on delete cascade,
  org_id uuid not null references organizations(id) on delete cascade,
  -- restrict: a template people are on can't be deleted out from under them.
  template_id uuid references shift_templates(id) on delete restrict,
  custom_start time,
  custom_end time,
  updated_by uuid references users(id),
  updated_at timestamptz not null default now(),
  constraint shift_assignments_one_kind check (
    (template_id is not null and custom_start is null and custom_end is null)
    or (template_id is null and custom_start is not null and custom_end is not null and custom_end > custom_start)
  )
);
create index shift_assignments_org_id_idx on shift_assignments(org_id);
create index shift_assignments_template_id_idx on shift_assignments(template_id);

-- An assignment's person and template must both be in the assignment's org:
-- RLS checks org_id on the row, but not that the referenced user/template
-- belong to that same org.
create or replace function app.enforce_shift_assignment_same_org()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not exists (select 1 from public.users where id = new.user_id and org_id = new.org_id) then
    raise exception 'shift_assignments: user is not in this organization';
  end if;
  if new.template_id is not null
     and not exists (select 1 from public.shift_templates where id = new.template_id and org_id = new.org_id) then
    raise exception 'shift_assignments: template is not in this organization';
  end if;
  return new;
end;
$$;

create trigger shift_assignments_same_org
before insert or update on shift_assignments
for each row execute function app.enforce_shift_assignment_same_org();

-- ---------- RLS ----------

alter table shift_templates enable row level security;
alter table shift_assignments enable row level security;
revoke all on shift_templates, shift_assignments from anon;
grant select, insert, update, delete on shift_templates, shift_assignments to authenticated;

create policy "members can view their org's shift templates"
on shift_templates for select
to authenticated
using (org_id = app.current_org_id());

create policy "admins manage their org's shift templates"
on shift_templates for all
to authenticated
using (org_id = app.current_org_id() and app.is_admin())
with check (org_id = app.current_org_id() and app.is_admin());

create policy "members can view their own shift"
on shift_assignments for select
to authenticated
using (org_id = app.current_org_id() and user_id = auth.uid());

create policy "admins manage their org's shift assignments"
on shift_assignments for all
to authenticated
using (org_id = app.current_org_id() and app.is_admin())
with check (org_id = app.current_org_id() and app.is_admin());

-- ---------- attendance: a new status ----------

-- Late in and early out on the same day; a record has one status.
alter type attendance_status add value 'late_early_leave';
