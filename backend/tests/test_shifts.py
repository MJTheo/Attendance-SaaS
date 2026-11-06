"""Shift times: the late/early status rules, clocking with a shift, the
shifts service and its admin-only routes."""

from datetime import date, datetime, timezone
from zoneinfo import ZoneInfo

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from postgrest.exceptions import APIError

from app.dependencies import get_user_client, require_profile
from app.routers import shifts as shifts_router
from app.services import attendance_service, shifts_service
from app.services.analytics_service import summarize_users, weekly_by_person
from app.services.attendance_service import AttendanceService, clock_in_status, clock_out_status
from app.services.shifts_service import ShiftValidationError, resolve_shift, validate_times

MANILA = ZoneInfo("Asia/Manila")
MON_FRI = [0, 1, 2, 3, 4]
DAY = {"kind": "custom", "template_id": None, "name": "Custom", "start": "08:00", "end": "17:00"}


def local(hm: str, day: str = "2026-11-02") -> datetime:  # Nov 2 2026 is a Monday
    return datetime.fromisoformat(f"{day}T{hm}").replace(tzinfo=MANILA)


# --- status rules ---------------------------------------------------------


@pytest.mark.parametrize("hm, expected", [
    ("07:45:00", "present"),
    ("08:00:59", "present"),  # still the start minute
    ("08:01:00", "late"),
    ("13:00:00", "late"),
])
def test_clock_in_is_late_after_the_start_minute(hm, expected):
    assert clock_in_status(local(hm), DAY, MON_FRI) == expected


def test_no_shift_or_a_day_off_is_always_present():
    assert clock_in_status(local("13:00:00"), None, MON_FRI) == "present"
    assert clock_in_status(local("13:00:00", "2026-11-07"), DAY, MON_FRI) == "present"  # Saturday


@pytest.mark.parametrize("status, out, expected", [
    ("present", "16:59", "early_leave"),
    ("present", "17:00", "present"),  # leaving at the end minute isn't early
    ("late", "15:00", "late_early_leave"),
    ("late", "18:00", "late"),
    ("missed_clockout", "15:00", "missed_clockout"),  # only present/late change
])
def test_clock_out_before_the_end_is_early(status, out, expected):
    assert clock_out_status(status, local("08:00"), local(out), DAY, MON_FRI) == expected


def test_clock_out_on_a_later_day_or_without_a_shift_never_changes_status():
    assert clock_out_status("present", local("08:00"), local("01:00", "2026-11-03"), DAY, MON_FRI) == "present"
    assert clock_out_status("present", local("08:00"), local("10:00"), None, MON_FRI) == "present"


# --- clocking writes with the service-role repo ------------------------------


class ReadRepo:
    def __init__(self, open_record=None):
        self.open_record = open_record

    def get_open_record(self, user_id):
        return self.open_record

    def list_for_user_range(self, user_id, start, end):
        return []


class WriteRepo:
    def __init__(self):
        self.calls = []

    def create_clock_in(self, org_id, user_id, at, status):
        self.calls.append(("in", user_id, status))
        return {"status": status}

    def set_clock_out(self, record_id, at, notes, status):
        self.calls.append(("out", record_id, status))
        return {"status": status}


def test_clocking_uses_the_shift_and_writes_through_the_write_repo(frozen_now):
    # 01:30Z is 09:30 in Manila: late for an 08:00 start.
    frozen_now(attendance_service, datetime(2026, 11, 2, 1, 30, tzinfo=timezone.utc))
    writes = WriteRepo()
    AttendanceService(ReadRepo(), writes).clock_in("org", "u", MANILA, DAY, MON_FRI)
    open_record = {"id": "r1", "status": "late", "clock_in": "2026-11-02T01:30:00+00:00"}
    # 07:00Z is 15:00 in Manila: before 17:00, so late becomes late & early leave.
    frozen_now(attendance_service, datetime(2026, 11, 2, 7, 0, tzinfo=timezone.utc))
    AttendanceService(ReadRepo(open_record), writes).clock_out("u", None, MANILA, DAY, MON_FRI)
    assert writes.calls == [("in", "u", "late"), ("out", "r1", "late_early_leave")]


# --- analytics count late & early leave as both --------------------------------


def test_late_early_leave_counts_as_late_and_as_early():
    records = [{"user_id": "a", "user_name": "Ana", "clock_in": "2026-11-02T01:00:00+00:00", "status": s}
               for s in ("late_early_leave", "present")]
    [ana] = summarize_users(records)
    assert (ana["late_early_leave"], ana["late_rate"]) == (1, 0.5)
    [row] = weekly_by_person(records, [{"id": "a", "name": "Ana"}], [date(2026, 11, 2)], MANILA)
    assert row["weeks"][0]["early_leave"] == 1


# --- validation + resolving ----------------------------------------------------


@pytest.mark.parametrize("start, end", [("8:00", "17:00"), ("08:00", "24:00"), ("17:00", "08:00"), ("09:00", "09:00")])
def test_times_must_be_hhmm_and_same_day(start, end):
    with pytest.raises(ShiftValidationError):
        validate_times(start, end)


def test_resolve_shift_prefers_the_template_and_trims_seconds():
    template = {"user_id": "u", "template_id": "t", "custom_start": None, "custom_end": None,
                "template": {"name": "Day", "start_time": "08:00:00", "end_time": "17:00:00"}}
    assert resolve_shift(template) == {"kind": "template", "template_id": "t", "name": "Day", "start": "08:00", "end": "17:00"}
    custom = {"user_id": "u", "template_id": None, "custom_start": "10:00:00", "custom_end": "19:30:00", "template": None}
    assert resolve_shift(custom) == {"kind": "custom", "template_id": None, "name": "Custom", "start": "10:00", "end": "19:30"}
    assert resolve_shift(None) is None


# --- service + routes --------------------------------------------------------------


class FakeShifts:
    templates: dict = {}
    assignments: dict = {}

    def __init__(self, client):
        pass

    def list_templates(self):
        return list(self.templates.values())

    def get_template(self, tid):
        return self.templates.get(tid)

    def create_template(self, org_id, name, start, end):
        if any(t["name"] == name for t in self.templates.values()):
            raise APIError({"code": "23505", "message": "duplicate"})
        row = {"id": f"t{len(self.templates) + 1}", "name": name, "start_time": f"{start}:00", "end_time": f"{end}:00"}
        self.templates[row["id"]] = row
        return row

    def update_template(self, tid, fields):
        if tid not in self.templates:
            return None
        self.templates[tid].update(fields)
        return self.templates[tid]

    def delete_template(self, tid):
        self.templates.pop(tid)

    def list_assignments(self, org_id=None):
        # Like the real query: the template is embedded.
        return [self.get_assignment(user_id) for user_id in self.assignments]

    def get_assignment(self, user_id):
        a = self.assignments.get(user_id)
        if a and a["template_id"]:
            t = self.templates[a["template_id"]]
            a = {**a, "template": {"name": t["name"], "start_time": t["start_time"], "end_time": t["end_time"]}}
        return a

    def set_assignment(self, org_id, user_id, updated_by, template_id, custom_start, custom_end):
        self.assignments[user_id] = {"user_id": user_id, "template_id": template_id, "template": None,
                                     "custom_start": custom_start, "custom_end": custom_end}

    def clear_assignment(self, user_id):
        self.assignments.pop(user_id, None)


class FakeUsers:
    def __init__(self, client):
        pass

    def list_for_org(self):
        return [{"id": "ana", "name": "Ana", "role": "staff"}, {"id": "ben", "name": "Ben", "role": "admin"}]


@pytest.fixture
def client_as(monkeypatch):
    FakeShifts.templates, FakeShifts.assignments = {}, {}
    plan = {"value": "free"}

    class FakeOrgs:
        def __init__(self, client): pass
        def get(self, org_id): return {"plan": plan["value"]}

    monkeypatch.setattr(shifts_service, "ShiftsRepository", FakeShifts)
    monkeypatch.setattr(shifts_service, "UsersRepository", FakeUsers)
    monkeypatch.setattr(shifts_service, "OrganizationsRepository", FakeOrgs)
    app = FastAPI()
    app.include_router(shifts_router.router)
    app.dependency_overrides[get_user_client] = lambda: object()

    def make(role, demo=False):
        plan["value"] = "demo" if demo else "free"
        app.dependency_overrides[require_profile] = lambda: {"id": "ben", "org_id": "o", "role": role, "name": "B", "email": "b@x"}
        return TestClient(app)

    return make


def test_staff_cannot_use_any_shift_endpoint(client_as):
    staff = client_as("staff")
    assert staff.get("/shifts/templates").status_code == 403
    assert staff.post("/shifts/templates", json={"name": "Day", "start": "08:00", "end": "17:00"}).status_code == 403
    assert staff.put("/shifts/people/ana", json={"mode": "none"}).status_code == 403


@pytest.mark.parametrize("role", ["admin", "super_admin"])
def test_admins_manage_templates_and_people(client_as, role):
    c = client_as(role)
    created = c.post("/shifts/templates", json={"name": " Day ", "start": "08:00", "end": "17:00"})
    assert created.status_code == 201 and created.json() == {"id": "t1", "name": "Day", "start": "08:00", "end": "17:00", "people": 0}
    assert c.post("/shifts/templates", json={"name": "Day", "start": "09:00", "end": "18:00"}).status_code == 409
    assert c.post("/shifts/templates", json={"name": "Night", "start": "22:00", "end": "06:00"}).status_code == 422

    assert c.put("/shifts/people/ana", json={"mode": "template", "template_id": "t1"}).json()["name"] == "Day"
    assert c.put("/shifts/people/ben", json={"mode": "custom", "start": "10:00", "end": "19:00"}).json()["start"] == "10:00"
    assert c.put("/shifts/people/zed", json={"mode": "none"}).status_code == 404  # not in this org
    people = {p["user_id"]: p["shift"] for p in c.get("/shifts/people").json()}
    assert people["ana"]["name"] == "Day" and people["ben"]["name"] == "Custom"
    assert c.get("/shifts/templates").json()[0]["people"] == 1

    # In use: can't delete until nobody's on it.
    assert c.delete("/shifts/templates/t1").status_code == 409
    assert c.put("/shifts/people/ana", json={"mode": "none"}).status_code == 200
    assert c.delete("/shifts/templates/t1").status_code == 204


def test_demo_org_shifts_are_read_only(client_as):
    c = client_as("admin", demo=True)
    assert c.get("/shifts/templates").status_code == 200
    assert c.post("/shifts/templates", json={"name": "Day", "start": "08:00", "end": "17:00"}).status_code == 403
    assert c.put("/shifts/people/ana", json={"mode": "none"}).status_code == 403
