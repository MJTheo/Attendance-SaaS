-- Database-level enforcement of architecture rule 2 ("no silent edits") on the
-- one direct-UPDATE path staff have: clocking out.
--
-- The RLS policy on attendance_records already restricts staff UPDATEs to their
-- own row while clock_out is null, but RLS is row-level, not column-level — it
-- can't stop someone from also rewriting clock_in or user_id/org_id in that
-- same call. This trigger closes that gap for real end-user sessions
-- (auth.role() = 'authenticated'). It does NOT fire against the backend's
-- service-role client (auth.role() = 'service_role'), which is the only path
-- allowed to apply an approved correction's new_value to a record.
--
-- `notes` and `status` are deliberately NOT in the immutable list: setting a
-- note or a recalculated status is part of the clock-out action itself, not a
-- retroactive edit. The `old.clock_out is not null` check below is what
-- actually prevents retroactive edits — once clock_out is set, this trigger
-- rejects every further UPDATE from an authenticated session, notes included.

create or replace function app.enforce_attendance_clockout_only()
returns trigger
language plpgsql
as $$
begin
  if auth.role() = 'authenticated' then
    if old.clock_out is not null then
      raise exception 'attendance_records: record already has a clock_out; further edits require a correction';
    end if;

    if new.clock_in is distinct from old.clock_in
       or new.user_id is distinct from old.user_id
       or new.org_id is distinct from old.org_id then
      raise exception 'attendance_records: direct edits are limited to clock_out/status/notes; other fields require a correction';
    end if;
  end if;

  return new;
end;
$$;

create trigger attendance_records_clockout_guard
before update on attendance_records
for each row execute function app.enforce_attendance_clockout_only();

-- Housekeeping: keep updated_at current on every write.

create or replace function app.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger attendance_records_set_updated_at
before update on attendance_records
for each row execute function app.set_updated_at();
