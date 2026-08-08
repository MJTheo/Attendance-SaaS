from datetime import date, datetime, timedelta, timezone

from supabase import Client

from app.repositories.attendance import AttendanceRepository
from app.repositories.leave_requests import LeaveRequestsRepository
from app.repositories.users import UsersRepository


def close_out_previous_day(service_client: Client) -> None:
    """Runs daily on DAILY_CLOSEOUT_CRON, shortly after midnight UTC, to
    finalize the calendar day that just ended for every org:

      - any attendance record still open (no clock_out) from that day gets
        flagged 'missed_clockout' instead of looking like an ongoing shift
        forever — the staff member requests a correction the next day to
        fix it, same as any other attendance mistake.
      - any org member with no attendance record and no approved leave
        covering that day gets an auto-created 'absent' record, but only on
        a day the org actually operates (per organizations.working_days).

    This updates attendance_records.status (and, for missed_clockout,
    clock_out) outside the corrections flow, which looks like it conflicts
    with "no silent edits to attendance records" — but status is a
    server-computed field (see AttendanceService._determine_clock_in_status),
    not a fact the staff member reported, and there was no clock_out fact
    reported yet either. This job is completing the clock-out/status
    computation once the day's deadline has passed, the same way a real
    clock-out already computes it on user action; it never overwrites an
    already-reported clock_in, clock_out, or notes value. The clock_out it
    sets is a synthetic day-boundary placeholder, not a real observation —
    that's exactly why the record is flagged for a correction, not left
    looking authoritative. Creating a fresh 'absent' row for a no-show is
    unambiguously fine under the same rule — it doesn't edit anything.

    Service-role only, for the same reason as generate_weekly_reports: no
    authenticated caller to scope RLS to, and needs to iterate every org.
    """
    target_day = (datetime.now(timezone.utc) - timedelta(days=1)).date()

    orgs = service_client.table("organizations").select("id, working_days").execute().data
    for org in orgs:
        _close_out_org_day(service_client, org["id"], org["working_days"], target_day)


def _close_out_org_day(service_client: Client, org_id: str, working_days: int, day: date) -> None:
    attendance = AttendanceRepository(service_client)
    day_start = datetime.combine(day, datetime.min.time(), tzinfo=timezone.utc)
    day_end = day_start + timedelta(days=1)

    org_records = attendance.list_for_org_range(day_start.isoformat(), day_end.isoformat(), org_id=org_id)

    for record in org_records:
        # status not in (missed_clockout, absent): skip records already
        # flagged, and skip auto-absent records — those also carry
        # clock_out = null by design (no clock-in ever happened) and aren't
        # an abandoned open shift.
        if record["clock_out"] is None and record["status"] not in ("missed_clockout", "absent"):
            # clock_out is set to the day boundary (not left null) so the
            # record stops reading as "currently open" and no longer blocks
            # the staff member from clocking in again — it's a placeholder
            # the correction is expected to replace with the real time.
            attendance.apply_correction(
                record["id"], {"status": "missed_clockout", "clock_out": day_end.isoformat()}
            )

    if day.weekday() >= working_days:
        return  # non-working day — nobody was expected to clock in

    users_with_records = {r["user_id"] for r in org_records}
    approved_leave = LeaveRequestsRepository(service_client).list_approved_in_range(
        day.isoformat(), day.isoformat(), org_id=org_id
    )
    users_on_leave = {leave["user_id"] for leave in approved_leave}

    for user in UsersRepository(service_client).list_for_org(org_id=org_id):
        if user["id"] in users_with_records or user["id"] in users_on_leave:
            continue
        attendance.create_clock_in(org_id, user["id"], day_start.isoformat(), "absent")
