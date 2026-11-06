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
    monkeypatch.setattr(closeout, "_close_out_org_day",
                        lambda client, org_id, day, tz, working_days: calls.append((org_id, day, tz.key, working_days)))
    orgs = [{"id": "manila", "timezone": "Asia/Manila", "working_days": 0b0011111},
            {"id": "nyc", "timezone": "America/New_York", "working_days": 0b0111110}]
    closeout.close_out_previous_day(FakeServiceClient(orgs))
    assert calls == [("manila", date(2026, 11, 2), "Asia/Manila", [0, 1, 2, 3, 4]),
                     ("nyc", date(2026, 11, 1), "America/New_York", [1, 2, 3, 4, 5])]


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
    # No working days, so this test is only about flagging open records.
    closeout._close_out_org_day(object(), "org-1", date(2026, 11, 2), MANILA, [])

    day_end = "2026-11-03T00:00:00+08:00"
    assert calls == [
        ("list", "2026-11-02T00:00:00+08:00", day_end, "org-1"),
        ("update", "open", {"status": "missed_clockout", "clock_out": day_end}),
        ("update", "open-late", {"status": "missed_clockout", "clock_out": day_end}),
    ]


def _absence_run(monkeypatch, *, records=(), assignments=(), leave=(), working_days=(0, 1, 2, 3, 4), day=date(2026, 11, 2)):
    """Runs _close_out_org_day for Mon Nov 2 (Manila) and returns the rows it created."""
    created = []

    class FakeAttendance:
        def __init__(self, client): pass
        def list_for_org_range(self, start, end, org_id=None): return list(records)
        def apply_correction(self, record_id, fields): pass
        def create_clock_in(self, org_id, user_id, clock_in_at, status):
            created.append((user_id, clock_in_at, status))

    class FakeShifts:
        def __init__(self, client): pass
        def list_assignments(self, org_id=None): return list(assignments)

    class FakeLeave:
        def __init__(self, client): pass
        def list_approved_in_range(self, start, end, org_id=None): return list(leave)

    monkeypatch.setattr(closeout, "AttendanceRepository", FakeAttendance)
    monkeypatch.setattr(closeout, "ShiftsRepository", FakeShifts)
    monkeypatch.setattr(closeout, "LeaveRequestsRepository", FakeLeave)
    closeout._close_out_org_day(object(), "org-1", day, MANILA, list(working_days))
    return created


def shift(user_id, start="08:00", end="17:00", updated_at="2026-10-01T00:00:00+00:00"):
    return {"user_id": user_id, "template_id": None, "custom_start": f"{start}:00", "custom_end": f"{end}:00",
            "template": None, "updated_at": updated_at}


def test_scheduled_people_with_no_record_are_marked_absent_at_their_shift_start(monkeypatch):
    created = _absence_run(monkeypatch, assignments=[shift("ana", "09:30")])
    assert created == [("ana", "2026-11-02T09:30:00+08:00", "absent")]


def test_absence_skips_anyone_who_clocked_in_is_on_leave_or_has_no_shift(monkeypatch):
    created = _absence_run(
        monkeypatch,
        records=[{"id": "r", "user_id": "ben", "clock_out": "2026-11-02T10:00:00+00:00", "status": "present"}],
        assignments=[shift("ben"), shift("cy"), shift("dee")],
        leave=[{"user_id": "cy"}],
    )
    # Ben clocked in, Cy is on approved leave; only Dee was expected and missing.
    assert [user for user, _, _ in created] == ["dee"]


def test_no_absences_on_non_working_days(monkeypatch):
    assert _absence_run(monkeypatch, assignments=[shift("ana")], working_days=(1, 2, 3, 4, 5)) == []


def test_a_shift_set_after_the_day_ended_did_not_apply_to_it(monkeypatch):
    # Set on Nov 3 (after Mon Nov 2 ended in Manila): no absence for Nov 2.
    created = _absence_run(monkeypatch, assignments=[shift("ana", updated_at="2026-11-03T01:00:00+00:00")])
    assert created == []


def test_running_twice_does_not_duplicate_absences(monkeypatch):
    # The first run's absent row is in the day's records on the second run.
    existing = [{"id": "a1", "user_id": "ana", "clock_out": None, "status": "absent"}]
    assert _absence_run(monkeypatch, records=existing, assignments=[shift("ana")]) == []
