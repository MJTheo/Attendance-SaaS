"""The nightly closeout job: each org closes its own local yesterday, open
records become missed clock-outs with a day-boundary placeholder, and nothing
else is touched or created (it once auto-created 'absent' rows, which then
blocked those people from ever clocking in again)."""

from datetime import date, datetime, timezone
from zoneinfo import ZoneInfo

from app.jobs import closeout

MANILA = ZoneInfo("Asia/Manila")


class FakeServiceClient:
    def __init__(self, orgs):
        self._orgs = orgs

    def table(self, name):
        assert name == "organizations"
        return self

    def select(self, columns):
        return self

    def execute(self):
        return type("Response", (), {"data": self._orgs})()


def test_each_org_closes_its_own_local_yesterday(frozen_now, monkeypatch):
    # 02:00Z on Nov 3 is 10:00 Nov 3 in Manila but 21:00 Nov 2 in New York.
    frozen_now(closeout, datetime(2026, 11, 3, 2, 0, tzinfo=timezone.utc))
    calls = []
    monkeypatch.setattr(closeout, "_close_out_org_day", lambda client, org_id, day, tz: calls.append((org_id, day, tz.key)))
    orgs = [{"id": "manila", "timezone": "Asia/Manila"}, {"id": "nyc", "timezone": "America/New_York"}]
    closeout.close_out_previous_day(FakeServiceClient(orgs))
    assert calls == [("manila", date(2026, 11, 2), "Asia/Manila"), ("nyc", date(2026, 11, 1), "America/New_York")]


def test_only_open_unflagged_records_become_missed_clockouts(monkeypatch):
    records = [
        {"id": "open", "clock_out": None, "status": "present"},
        {"id": "open-late", "clock_out": None, "status": "late"},
        {"id": "closed", "clock_out": "2026-11-02T10:00:00+00:00", "status": "present"},
        {"id": "already-flagged", "clock_out": None, "status": "missed_clockout"},
        {"id": "old-auto-absent", "clock_out": None, "status": "absent"},
    ]
    calls = []

    class FakeAttendance:
        # Records every call; has no insert method, so the job can't create rows.
        def __init__(self, client):
            pass

        def list_for_org_range(self, start, end, org_id=None):
            calls.append(("list", start, end, org_id))
            return records

        def apply_correction(self, record_id, fields):
            calls.append(("update", record_id, fields))

    monkeypatch.setattr(closeout, "AttendanceRepository", FakeAttendance)
    closeout._close_out_org_day(object(), "org-1", date(2026, 11, 2), MANILA)

    day_end = "2026-11-03T00:00:00+08:00"
    assert calls == [
        ("list", "2026-11-02T00:00:00+08:00", day_end, "org-1"),
        ("update", "open", {"status": "missed_clockout", "clock_out": day_end}),
        ("update", "open-late", {"status": "missed_clockout", "clock_out": day_end}),
    ]
