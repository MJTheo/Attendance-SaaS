"""Clocking in: one record per org-local day, and an old auto-absent row (no
clock-out by design) must never look like an open shift."""

from datetime import datetime, timezone
from zoneinfo import ZoneInfo

import pytest

from app.repositories.attendance import AttendanceRepository
from app.services import attendance_service
from app.services.attendance_service import (
    AlreadyClockedInError,
    AlreadyClockedTodayError,
    AttendanceService,
    NoOpenRecordError,
)

MANILA = ZoneInfo("Asia/Manila")
# 16:30Z on Nov 2 is already 00:30 on Nov 3 in Manila.
NOW = datetime(2026, 11, 2, 16, 30, tzinfo=timezone.utc)


class FakeRepo:
    def __init__(self, open_record=None, todays=()):
        self.open_record, self.todays, self.calls = open_record, list(todays), []

    def get_open_record(self, user_id):
        return self.open_record

    def list_for_user_range(self, user_id, start, end):
        self.calls.append(("range", start, end))
        return self.todays

    def create_clock_in(self, org_id, user_id, clock_in_at, status):
        self.calls.append(("create", clock_in_at, status))
        return {"id": "new", "status": status}


def test_clock_in_refused_while_a_shift_is_open(frozen_now):
    frozen_now(attendance_service, NOW)
    with pytest.raises(AlreadyClockedInError):
        AttendanceService(FakeRepo(open_record={"id": "r1"})).clock_in("org", "u", MANILA)


def test_clock_in_is_capped_at_once_per_org_local_day(frozen_now):
    frozen_now(attendance_service, NOW)
    repo = FakeRepo(todays=[{"id": "earlier"}])
    with pytest.raises(AlreadyClockedTodayError):
        AttendanceService(repo).clock_in("org", "u", MANILA)
    # "Today" is Nov 3 in Manila, not Nov 2 in UTC.
    assert repo.calls == [("range", "2026-11-03T00:00:00+08:00", "2026-11-04T00:00:00+08:00")]


def test_clock_in_creates_a_present_record(frozen_now):
    frozen_now(attendance_service, NOW)
    repo = FakeRepo()
    assert AttendanceService(repo).clock_in("org", "u", MANILA) == {"id": "new", "status": "present"}
    assert repo.calls[-1] == ("create", NOW.isoformat(), "present")


def test_clock_out_needs_an_open_record():
    with pytest.raises(NoOpenRecordError):
        AttendanceService(FakeRepo()).clock_out("u", None)


def test_open_record_lookup_ignores_auto_absent_rows():
    # Regression: auto-created 'absent' rows have clock_out = null by design; without the
    # status filter they read as an open shift and block the person from ever clocking in.
    chain = []

    class Query:
        def __getattr__(self, name):
            def step(*args, **kwargs):
                chain.append((name, *args))
                return self
            return step

        def execute(self):
            return type("Response", (), {"data": []})()

    class Client:
        def table(self, name):
            chain.append(("table", name))
            return Query()

    assert AttendanceRepository(Client()).get_open_record("u") is None
    assert ("eq", "user_id", "u") in chain
    assert ("is_", "clock_out", "null") in chain
    assert ("neq", "status", "absent") in chain
