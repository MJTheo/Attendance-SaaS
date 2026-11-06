from datetime import date, datetime, time, timedelta
from zoneinfo import ZoneInfo

from supabase import Client

from app.repositories.attendance import AttendanceRepository
from app.repositories.leave_requests import LeaveRequestsRepository
from app.repositories.organizations import mask_to_days
from app.repositories.shifts import ShiftsRepository
from app.services.analytics_service import local_day_bounds
from app.services.shifts_service import resolve_shift


def close_out_previous_day(service_client: Client) -> None:
    """Runs daily on DAILY_CLOSEOUT_CRON to finalize the calendar day that
    just ended for every org, in that org's own timezone (organizations.timezone)
    rather than UTC's: any attendance record still open (no clock_out) from
    that day gets flagged 'missed_clockout' instead of looking like an
    ongoing shift forever — the staff member requests a correction the next
    day to fix it, same as any other attendance mistake.

    It also records absences — but only where a schedule says someone was
    expected: people with a shift (shift_assignments), on one of the org's
    working days, with no attendance record that day and no approved leave
    covering it, whose shift was already set before the day ended. Everyone
    else's empty day still reads as "no data", not "confirmed absent". (An
    earlier version auto-created 'absent' rows for everyone, with no
    schedule to justify it; that was removed, and its old rows are left
    alone as historical fact rather than backfill-deleted — deleting
    attendance_records outside the corrections flow would itself violate
    "no silent edits to attendance records".) An absent row's clock_in is the
    shift start, its clock_out null; get_open_record ignores absent rows, so
    one never reads as an open shift. A wrong absence is fixed the normal
    way, with a correction.

    Each org's target day is computed independently from "now in that org's
    timezone minus one day" rather than the job's own (UTC) firing time —
    that's what makes this correct regardless of when in UTC the cron fires
    or how far the org's offset is from UTC: whatever calendar day just
    ended locally for that org is always exactly one local-day-in-the-past
    from its own current local time, full stop. The tradeoff is latency, not
    correctness — an org's day is closed out within roughly 24h of ending
    locally (bounded by the job's own daily cadence), same margin the
    original UTC-only version had for UTC-based orgs.

    This updates attendance_records.status and clock_out outside the
    corrections flow, which looks like it conflicts with "no silent edits to
    attendance records" — but status is a server-computed field (see
    attendance_service.clock_in_status/clock_out_status), not a fact the staff
    member reported, and there was no clock_out fact reported yet either.
    This job is completing the clock-out/status computation once the day's
    deadline has passed, the same way a real clock-out already computes it
    on user action; it never overwrites an already-reported clock_in,
    clock_out, or notes value. The clock_out it sets is a synthetic
    day-boundary placeholder, not a real observation — that's exactly why
    the record is flagged for a correction, not left looking authoritative.

    Service-role only, for the same reason as generate_weekly_reports: no
    authenticated caller to scope RLS to, and needs to iterate every org.
    """
    orgs = service_client.table("organizations").select("id, timezone, working_days").execute().data
    for org in orgs:
        tz = ZoneInfo(org["timezone"])
        target_day = (datetime.now(tz) - timedelta(days=1)).date()
        _close_out_org_day(service_client, org["id"], target_day, tz, mask_to_days(org["working_days"]))


def _close_out_org_day(service_client: Client, org_id: str, day: date, tz: ZoneInfo, working_days: list[int]) -> None:
    attendance = AttendanceRepository(service_client)
    day_start, day_end = local_day_bounds(day, tz)

    org_records = attendance.list_for_org_range(day_start.isoformat(), day_end.isoformat(), org_id=org_id)

    for record in org_records:
        # status not in (missed_clockout, absent): skip records already
        # flagged, and skip any (historical) auto-absent records — those
        # also carry clock_out = null by design and aren't an abandoned
        # open shift.
        if record["clock_out"] is None and record["status"] not in ("missed_clockout", "absent"):
            # clock_out is set to the day boundary (not left null) so the
            # record stops reading as "currently open" and no longer blocks
            # the staff member from clocking in again — it's a placeholder
            # the correction is expected to replace with the real time.
            attendance.apply_correction(
                record["id"], {"status": "missed_clockout", "clock_out": day_end.isoformat()}
            )

    if day.weekday() in working_days:
        _record_absences(service_client, attendance, org_id, day, tz, day_end, org_records)


def _record_absences(service_client: Client, attendance: AttendanceRepository, org_id: str, day: date,
                     tz: ZoneInfo, day_end: datetime, org_records: list[dict]) -> None:
    assignments = ShiftsRepository(service_client).list_assignments(org_id=org_id)
    if not assignments:
        return
    recorded = {record["user_id"] for record in org_records}
    on_leave = {
        leave["user_id"]
        for leave in LeaveRequestsRepository(service_client).list_approved_in_range(
            day.isoformat(), day.isoformat(), org_id=org_id
        )
    }
    for assignment in assignments:
        shift = resolve_shift(assignment)
        user_id = assignment["user_id"]
        if shift is None or user_id in recorded or user_id in on_leave:
            continue
        # A shift set or changed after the day ended didn't apply to it.
        if datetime.fromisoformat(assignment["updated_at"]) >= day_end:
            continue
        clock_in = datetime.combine(day, time.fromisoformat(shift["start"]), tzinfo=tz)
        # Same insert as a clock-in, with status 'absent' and no clock_out.
        attendance.create_clock_in(org_id, user_id, clock_in.isoformat(), "absent")
