"""Day-boundary logic in analytics_service: streaks, weekday late rates, local
day bounds across DST, leave clipping and per-day detail — all in the org's
own timezone. Shift times, grace periods and holidays will build on these."""

from datetime import date, datetime, timedelta, timezone
from zoneinfo import ZoneInfo

from app.services import analytics_service
from app.services.analytics_service import (
    compute_streak,
    daily_trend,
    day_detail_for_org,
    day_detail_for_user,
    late_rate_by_weekday,
    local_day_bounds,
)

MANILA = ZoneInfo("Asia/Manila")
NEW_YORK = ZoneInfo("America/New_York")
MON_FRI = [0, 1, 2, 3, 4]
# Wednesday 2026-11-04, 18:00 in Manila.
NOW = datetime(2026, 11, 4, 18, 0, tzinfo=MANILA)


def at(day: str, hm: str = "09:00", tz=MANILA, status="present", **extra) -> dict:
    """A record clocked in at a local wall-clock time, stored as UTC like the API returns it."""
    local = datetime.fromisoformat(f"{day}T{hm}:00").replace(tzinfo=tz)
    return {"clock_in": local.astimezone(timezone.utc).isoformat(), "status": status, **extra}


# --- compute_streak -------------------------------------------------------


def test_streak_counts_consecutive_working_days_through_today(frozen_now):
    frozen_now(analytics_service, NOW)
    records = [at("2026-11-02"), at("2026-11-03"), at("2026-11-04")]
    assert compute_streak(records, MON_FRI, MANILA) == 3


def test_streak_starts_from_yesterday_before_todays_clock_in(frozen_now):
    # Not clocked in yet today — the streak isn't shown as broken mid-day.
    frozen_now(analytics_service, NOW)
    assert compute_streak([at("2026-11-02"), at("2026-11-03")], MON_FRI, MANILA) == 2


def test_weekend_without_records_is_not_a_gap(frozen_now):
    frozen_now(analytics_service, NOW)
    records = [at("2026-10-29"), at("2026-10-30"), at("2026-11-02"), at("2026-11-03"), at("2026-11-04")]
    assert compute_streak(records, MON_FRI, MANILA) == 5


def test_arbitrary_working_days_decide_what_a_gap_is(frozen_now):
    frozen_now(analytics_service, NOW)
    tue_sat = [1, 2, 3, 4, 5]
    # Sat Oct 31 → (Sun, Mon off) → Tue, Wed: Monday is a day off for this org, not a gap.
    records = [at("2026-10-31"), at("2026-11-03"), at("2026-11-04")]
    assert compute_streak(records, tue_sat, MANILA) == 3
    # The same records with Mon–Fri: the empty Monday is a working day, so the streak stops there.
    assert compute_streak(records, MON_FRI, MANILA) == 2


def test_absent_record_does_not_count_and_breaks_the_streak(frozen_now):
    frozen_now(analytics_service, NOW)
    records = [at("2026-11-02"), at("2026-11-03", status="absent"), at("2026-11-04")]
    assert compute_streak(records, MON_FRI, MANILA) == 1


def test_streak_buckets_clock_ins_by_org_local_day(frozen_now):
    frozen_now(analytics_service, NOW)
    # 23:30 on Tue Nov 3 in Manila is 15:30Z — still Tuesday locally, not Wednesday.
    late_night = at("2026-11-03", "23:30")
    assert late_night["clock_in"].startswith("2026-11-03T15:30")
    assert compute_streak([at("2026-11-02"), late_night], MON_FRI, MANILA) == 2


def test_no_records_means_no_streak(frozen_now):
    frozen_now(analytics_service, NOW)
    assert compute_streak([], MON_FRI, MANILA) == 0


# --- late_rate_by_weekday -------------------------------------------------


def test_weekday_late_rate_covers_working_days_only_in_org_time():
    records = [
        at("2026-11-02", status="late"),  # Monday
        at("2026-11-02"),
        at("2026-11-02"),
        at("2026-11-03", "23:30", status="late"),  # Tuesday locally (Wednesday 15:30Z would be wrong)
        at("2026-11-07"),  # Saturday — not a working day here
    ]
    rows = late_rate_by_weekday(records, [0, 1, 2], MANILA)
    assert [r["weekday"] for r in rows] == ["Monday", "Tuesday", "Wednesday"]
    assert rows[0] == {"weekday": "Monday", "total": 3, "late": 1, "late_rate": 0.333}
    assert (rows[1]["late"], rows[1]["total"], rows[1]["late_rate"]) == (1, 1, 1.0)
    assert rows[2] == {"weekday": "Wednesday", "total": 0, "late": 0, "late_rate": 0.0}


# --- local_day_bounds -----------------------------------------------------


def test_local_day_bounds_follow_the_org_clock_across_dst():
    start, end = local_day_bounds(date(2026, 11, 1), NEW_YORK)  # US DST ends this day
    # Same-zone subtraction is wall-clock in Python; compare real elapsed time in UTC.
    assert end.astimezone(timezone.utc) - start.astimezone(timezone.utc) == timedelta(hours=25)
    assert (start.isoformat(), end.isoformat()) == ("2026-11-01T00:00:00-04:00", "2026-11-02T00:00:00-05:00")

    start, end = local_day_bounds(date(2026, 11, 2), MANILA)
    assert start.isoformat() == "2026-11-02T00:00:00+08:00" and end - start == timedelta(hours=24)


# --- leave clipping -------------------------------------------------------


def test_leave_spanning_the_window_counts_only_inside_it():
    leave = [{"start_date": "2026-10-30", "end_date": "2026-11-03", "leave_type": "annual", "status": "approved"}]
    days = daily_trend([], leave, date(2026, 11, 1), date(2026, 11, 5), MANILA)
    assert [d["annual_leave"] for d in days] == [1, 1, 1, 0, 0]
    assert len(days) == 5


# --- day detail -----------------------------------------------------------


def test_day_detail_prefers_approved_leave_over_a_record():
    records = [at("2026-11-03", user_id="a", clock_out=None, notes="x")]
    leave = [{"user_id": "a", "start_date": "2026-11-03", "end_date": "2026-11-03", "leave_type": "sick", "reason": "Flu"}]
    detail = day_detail_for_user(records, leave, "a", date(2026, 11, 3), MANILA)
    assert (detail["status"], detail["leave_type"], detail["leave_reason"], detail["clock_in"]) == ("sick_leave", "sick", "Flu", None)


def test_day_detail_matches_the_record_by_local_date():
    late_night = at("2026-11-03", "23:30", user_id="a", clock_out=None, notes="Late shift")
    on_tuesday = day_detail_for_user([late_night], [], "a", date(2026, 11, 3), MANILA)
    assert (on_tuesday["status"], on_tuesday["notes"]) == ("present", "Late shift")
    on_wednesday = day_detail_for_user([late_night], [], "a", date(2026, 11, 4), MANILA)
    assert on_wednesday == {"date": "2026-11-04", "status": None, "clock_in": None, "clock_out": None,
                            "notes": None, "leave_type": None, "leave_reason": None}


def test_day_detail_for_org_has_one_row_per_member():
    users = [{"id": "a", "name": "Ana"}, {"id": "b", "name": "Ben"}]
    rows = day_detail_for_org([at("2026-11-03", user_id="b")], [], users, date(2026, 11, 3), MANILA)
    assert [(r["user_id"], r["name"], r["status"]) for r in rows] == [("a", "Ana", None), ("b", "Ben", "present")]
