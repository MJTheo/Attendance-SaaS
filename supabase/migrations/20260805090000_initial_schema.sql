-- Initial schema for the Attendance SaaS data model.
-- See CLAUDE.md "Data model" for the source of truth on table shape.

create type user_role as enum ('admin', 'staff');
create type attendance_status as enum ('present', 'late', 'early_leave', 'absent');
create type correction_status as enum ('pending', 'approved', 'rejected');

create table organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  plan text not null default 'free',
  created_at timestamptz not null default now()
);

-- id matches auth.users.id 1:1 — this table is the profile/role row for a Supabase auth identity.
create table users (
  id uuid primary key references auth.users(id) on delete cascade,
  org_id uuid not null references organizations(id) on delete cascade,
  role user_role not null default 'staff',
  name text not null,
  email text not null,
  created_at timestamptz not null default now(),
  unique (org_id, email)
);
create index users_org_id_idx on users(org_id);

create table attendance_records (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  clock_in timestamptz not null,
  clock_out timestamptz,
  status attendance_status not null default 'present',
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index attendance_records_org_id_idx on attendance_records(org_id);
create index attendance_records_org_user_clockin_idx on attendance_records(org_id, user_id, clock_in);

-- org_id is denormalized here (not in the abbreviated CLAUDE.md table list) so RLS
-- can scope directly on this table per architecture rule 1, instead of joining out
-- to attendance_records on every policy check.
create table corrections (
  id uuid primary key default gen_random_uuid(),
  attendance_record_id uuid not null references attendance_records(id) on delete cascade,
  org_id uuid not null references organizations(id) on delete cascade,
  requested_by uuid not null references users(id),
  approved_by uuid references users(id),
  reason text not null,
  old_value jsonb not null,
  new_value jsonb not null,
  status correction_status not null default 'pending',
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);
create index corrections_org_id_idx on corrections(org_id);
create index corrections_attendance_record_id_idx on corrections(attendance_record_id);

create table reports (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  type text not null,
  generated_at timestamptz not null default now(),
  payload jsonb not null
);
create index reports_org_id_idx on reports(org_id);
