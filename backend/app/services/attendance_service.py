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


def _determine_clock_in_status() -> str:
    """Seam for late/absent detection.

    Always returns "present" for now: the data model has no shift-schedule
    config yet (organizations only has id/name/plan/created_at), so there's
    nothing to compare a clock-in time against. Wire in real late-detection
    once org shift config exists — don't invent a threshold here.
    """
    return "present"


class AttendanceService:
    def __init__(self, repo: AttendanceRepository):
        self._repo = repo

    def clock_in(self, org_id: str, user_id: str, tz: ZoneInfo) -> dict:
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

        return self._repo.create_clock_in(org_id, user_id, now.isoformat(), _determine_clock_in_status())

    def clock_out(self, user_id: str, notes: str | None) -> dict:
        open_record = self._repo.get_open_record(user_id)
        if open_record is None:
            raise NoOpenRecordError()
        now = datetime.now(timezone.utc).isoformat()
        return self._repo.set_clock_out(open_record["id"], now, notes)

    def history(self, user_id: str, limit: int = 50) -> list[dict]:
        return self._repo.list_for_user(user_id, limit)
