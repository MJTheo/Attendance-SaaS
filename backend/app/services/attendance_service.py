from datetime import datetime, timedelta, timezone

from app.repositories.attendance import AttendanceRepository


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

    def clock_in(self, org_id: str, user_id: str) -> dict:
        if self._repo.get_open_record(user_id) is not None:
            raise AlreadyClockedInError()

        now = datetime.now(timezone.utc)
        today_start = datetime.combine(now.date(), datetime.min.time(), tzinfo=timezone.utc)
        tomorrow_start = today_start + timedelta(days=1)
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
