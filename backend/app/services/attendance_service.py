from datetime import datetime, timezone
from zoneinfo import ZoneInfo

from app.repositories.attendance import AttendanceRepository
from app.services.analytics_service import local_day_bounds


class AlreadyClockedInError(Exception):
    pass


class AlreadyClockedTodayError(Exception):
    pass


class NoOpenRecordError(Exception):
    pass


def clock_in_status(clock_in_local: datetime, shift: dict | None, working_days: list[int]) -> str:
    """Late means clocking in after the shift's start minute (08:00:59 is on
    time, 08:01 is late) on one of the org's working days. No shift, or a
    non-working day, is always `present` — nothing to compare against. The
    grace period is a separate roadmap item; this is where it will apply."""
    if shift and clock_in_local.weekday() in working_days and clock_in_local.strftime("%H:%M") > shift["start"]:
        return "late"
    return "present"


def clock_out_status(status: str, clock_in_local: datetime, clock_out_local: datetime,
                     shift: dict | None, working_days: list[int]) -> str:
    """Leaving before the shift's end minute on the same working day is early:
    present → early_leave, late → late_early_leave. Shifts are same-day, so a
    clock-out on a later day is never early."""
    if (
        not shift
        or clock_in_local.weekday() not in working_days
        or clock_out_local.date() != clock_in_local.date()
        or clock_out_local.strftime("%H:%M") >= shift["end"]
    ):
        return status
    return {"present": "early_leave", "late": "late_early_leave"}.get(status, status)


class AttendanceService:
    """Reads go through the caller's RLS-scoped client; writes (clock-in,
    clock-out) through `write_repo`, the service-role client, because staff
    have no direct INSERT/UPDATE on attendance_records — the status is this
    service's computation, not something a client may send. org_id/user_id
    always come from the caller's verified profile."""

    def __init__(self, repo: AttendanceRepository, write_repo: AttendanceRepository | None = None):
        self._repo = repo
        self._write = write_repo or repo

    def clock_in(self, org_id: str, user_id: str, tz: ZoneInfo, shift: dict | None = None,
                 working_days: list[int] | None = None) -> dict:
        if self._repo.get_open_record(user_id) is not None:
            raise AlreadyClockedInError()

        now = datetime.now(timezone.utc)
        # "Today" is the org's local calendar day (tz), not the UTC day —
        # otherwise someone clocking in near UTC midnight in a non-UTC org
        # could be wrongly allowed a second clock-in for what's still the
        # same local day, or wrongly blocked from a new local day.
        today_start, tomorrow_start = local_day_bounds(now.astimezone(tz).date(), tz)
        # Capped at one clock-in per day, not just "no currently-open record" —
        # otherwise clocking out and then accidentally tapping "Clock in"
        # again minutes later would silently open a second record for today.
        if self._repo.list_for_user_range(user_id, today_start.isoformat(), tomorrow_start.isoformat()):
            raise AlreadyClockedTodayError()

        status = clock_in_status(now.astimezone(tz), shift, working_days or [])
        return self._write.create_clock_in(org_id, user_id, now.isoformat(), status)

    def clock_out(self, user_id: str, notes: str | None, tz: ZoneInfo | None = None, shift: dict | None = None,
                  working_days: list[int] | None = None) -> dict:
        open_record = self._repo.get_open_record(user_id)
        if open_record is None:
            raise NoOpenRecordError()
        now = datetime.now(timezone.utc)
        status = open_record["status"]
        if tz is not None:
            clock_in_local = datetime.fromisoformat(open_record["clock_in"]).astimezone(tz)
            status = clock_out_status(status, clock_in_local, now.astimezone(tz), shift, working_days or [])
        return self._write.set_clock_out(open_record["id"], now.isoformat(), notes, status)

    def history(self, user_id: str, limit: int = 50) -> list[dict]:
        return self._repo.list_for_user(user_id, limit)
