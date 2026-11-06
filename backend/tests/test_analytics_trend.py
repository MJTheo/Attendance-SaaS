from datetime import date
from zoneinfo import ZoneInfo

from app.services.analytics_service import (
    daily_trend,
    records_since,
    status_distribution,
    summarize_users,
    weekly_breakdown,
    weekly_by_person,
)

MANILA = ZoneInfo("Asia/Manila")


def test_trend_present_rate_counts_everyone_who_clocked_in():
    records = [
        {"clock_in": "2026-11-02T00:58:00+00:00", "status": "present"},
        {"clock_in": "2026-11-02T01:20:00+00:00", "status": "late"},
        {"clock_in": "2026-11-02T01:00:00+00:00", "status": "missed_clockout"},
        {"clock_in": "2026-11-02T00:00:00+00:00", "status": "absent"},
    ]
    leave = [{"start_date": "2026-11-02", "end_date": "2026-11-02", "leave_type": "sick", "status": "approved"}]
    days = {d["date"]: d for d in daily_trend(records, leave, date(2026, 11, 1), date(2026, 11, 2), MANILA)}

    # 3 clocked in (late and missed clock-out still count) out of 5 with a status.
    assert days["2026-11-02"]["present_rate"] == 0.6
    # Nothing recorded (a Sunday): skipped, not plotted as 0%.
    assert days["2026-11-01"]["present_rate"] is None


def test_distribution_keeps_missed_clockouts():
    records = [{"clock_in": "2026-11-02T00:58:00+00:00", "status": "missed_clockout"}]
    totals = status_distribution(records, [], date(2026, 11, 1), date(2026, 11, 2), MANILA)
    assert totals["missed_clockout"] == 1


def test_daily_trend_carries_missed_clockouts():
    records = [{"clock_in": "2026-11-02T01:00:00+00:00", "status": "missed_clockout"}]
    day = daily_trend(records, [], date(2026, 11, 2), date(2026, 11, 2), MANILA)[0]
    assert day["missed_clockout"] == 1 and day["present_rate"] == 1.0


def test_weekly_breakdown_buckets_monday_weeks_in_org_time():
    records = [
        # Sun Nov 8, 23:30 in Manila (15:30Z) — still the week of Nov 2, not the next UTC one.
        {"clock_in": "2026-11-08T15:30:00+00:00", "status": "absent"},
        {"clock_in": "2026-11-03T01:00:00+00:00", "status": "early_leave"},
        {"clock_in": "2026-11-10T01:00:00+00:00", "status": "present"},
        {"clock_in": "2026-11-10T01:10:00+00:00", "status": "late"},
    ]
    leave = [{"start_date": "2026-11-09", "end_date": "2026-11-10", "leave_type": "sick", "status": "approved"}]
    # A Wednesday-to-Wednesday window: widened back to Monday Nov 2, through today (Wed Nov 11).
    weeks = weekly_breakdown(records, leave, date(2026, 11, 4), date(2026, 11, 11), MANILA)
    assert [w["week_start"] for w in weeks] == ["2026-11-02", "2026-11-09"]
    first, second = weeks
    # The window widens to the Monday, so Nov 3's early leave counts.
    assert (first["absent"], first["early_leave"], first["partial"]) == (1, 1, False)
    assert first["present_rate"] == 0.5
    assert (second["present"], second["late"], second["sick_leave"], second["partial"]) == (1, 1, 2, True)
    assert second["present_rate"] == 0.5
    empty = weekly_breakdown([], [], date(2026, 11, 2), date(2026, 11, 8), MANILA)
    assert empty[0]["present_rate"] is None


def test_weekly_by_person_includes_members_without_records():
    members = [{"id": "b", "name": "ben"}, {"id": "a", "name": "Ana"}]
    records = [
        {"user_id": "a", "clock_in": "2026-11-03T01:00:00+00:00", "status": "absent"},
        {"user_id": "a", "clock_in": "2026-11-04T01:00:00+00:00", "status": "early_leave"},
        {"user_id": "a", "clock_in": "2026-11-05T01:00:00+00:00", "status": "late"},
    ]
    rows = weekly_by_person(records, members, [date(2026, 10, 26), date(2026, 11, 2)], MANILA)
    assert [r["name"] for r in rows] == ["Ana", "ben"]
    assert rows[0]["weeks"] == [{"week_start": "2026-10-26", "absent": 0, "early_leave": 0},
                                {"week_start": "2026-11-02", "absent": 1, "early_leave": 1}]
    assert all(w["absent"] == w["early_leave"] == 0 for w in rows[1]["weeks"])


def test_summary_late_rate_is_over_days_clocked_in():
    records = [
        {"user_id": "a", "user_name": "Ana", "status": s}
        for s in ("late", "present", "missed_clockout", "absent", "absent")
    ]
    [ana] = summarize_users(records)
    assert (ana["late"], ana["missed_clockout"], ana["absent"], ana["total"]) == (1, 1, 2, 5)
    assert ana["late_rate"] == 0.333  # 1 late of 3 days clocked in; absences don't dilute it


def test_records_since_uses_org_time():
    records = [{"clock_in": "2026-11-01T16:30:00+00:00"}, {"clock_in": "2026-11-01T15:30:00+00:00"}]
    # 16:30Z is Nov 2 00:30 in Manila; 15:30Z is still Nov 1.
    assert records_since(records, date(2026, 11, 2), MANILA) == records[:1]


def test_analytics_route_returns_eight_weeks_and_a_30_day_summary(monkeypatch):
    from datetime import datetime, timedelta

    from fastapi import FastAPI
    from fastapi.testclient import TestClient

    from app.dependencies import get_user_client, require_profile
    from app.routers import admin

    now = datetime.now(MANILA)
    recent = {"user_id": "a", "user_name": "Ana", "status": "absent", "clock_in": (now - timedelta(days=3)).isoformat()}
    older = {"user_id": "a", "user_name": "Ana", "status": "late", "clock_in": (now - timedelta(days=40)).isoformat()}

    class Orgs:
        def __init__(self, client): pass
        def get(self, org_id): return {"timezone": "Asia/Manila", "working_days": [0, 1, 2, 3, 4]}

    class Attendance:
        def __init__(self, client): pass
        def list_for_org(self, limit): return [recent, older]
        def list_for_org_range(self, start, end): return [recent, older]

    class Leave:
        def __init__(self, client): pass
        def list_approved_in_range(self, start, end): return []

    class Users:
        def __init__(self, client): pass
        def list_for_org(self): return [{"id": "a", "name": "Ana"}, {"id": "b", "name": "Ben"}]

    for name, cls in [("OrganizationsRepository", Orgs), ("AttendanceRepository", Attendance),
                      ("LeaveRequestsRepository", Leave), ("UsersRepository", Users)]:
        monkeypatch.setattr(admin, name, cls)
    app = FastAPI()
    app.include_router(admin.router)
    app.dependency_overrides[get_user_client] = lambda: object()
    app.dependency_overrides[require_profile] = lambda: {"id": "x", "org_id": "o", "role": "admin"}
    body = TestClient(app).get("/admin/analytics").json()

    mondays = [date.fromisoformat(w["week_start"]) for w in body["weeks"]]
    assert len(mondays) == 8 and all(m.weekday() == 0 for m in mondays)
    assert all(b - a == timedelta(weeks=1) for a, b in zip(mondays, mondays[1:]))
    assert body["weeks"][-1]["partial"] == (mondays[-1] + timedelta(days=6) > now.date())
    assert [p["name"] for p in body["weeks_by_person"]] == ["Ana", "Ben"]
    assert all(len(p["weeks"]) == 8 for p in body["weeks_by_person"])
    # The 40-day-old late record is outside the summary's 30 days.
    [ana] = body["users"]
    assert (ana["absent"], ana["late"], ana["total"]) == (1, 0, 1)
