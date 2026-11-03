from datetime import date
from zoneinfo import ZoneInfo

from app.services.analytics_service import daily_trend, status_distribution

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
