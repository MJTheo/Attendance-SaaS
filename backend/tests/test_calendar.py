from datetime import date
from zoneinfo import ZoneInfo

from app.services.analytics_service import build_personal_calendar

MANILA = ZoneInfo("Asia/Manila")


def test_personal_calendar_carries_times_and_leave_reason():
    records = [
        # 00:58Z is 08:58 in Manila, Nov 2
        {"clock_in": "2026-11-02T00:58:00+00:00", "clock_out": "2026-11-02T10:04:00+00:00", "status": "present"},
        {"clock_in": "2026-11-03T01:41:00+00:00", "clock_out": None, "status": "missed_clockout"},
        {"clock_in": "2026-11-04T00:00:00+00:00", "clock_out": None, "status": "absent"},
    ]
    leave = [{"start_date": "2026-11-05", "end_date": "2026-11-05", "leave_type": "annual", "reason": "Family holiday", "status": "approved"}]
    days = {d["date"]: d for d in build_personal_calendar(records, leave, date(2026, 11, 1), date(2026, 11, 6), MANILA)}

    assert days["2026-11-01"] == {"date": "2026-11-01", "status": None, "clock_in": None, "clock_out": None, "leave_reason": None}
    assert days["2026-11-02"]["status"] == "present"
    assert days["2026-11-02"]["clock_in"] == records[0]["clock_in"] and days["2026-11-02"]["clock_out"] == records[0]["clock_out"]
    assert days["2026-11-03"]["status"] == "missed_clockout" and days["2026-11-03"]["clock_out"] is None
    # An auto-absent row has no real times to show.
    assert days["2026-11-04"]["status"] == "absent" and days["2026-11-04"]["clock_in"] is None
    assert days["2026-11-05"] == {"date": "2026-11-05", "status": "annual_leave", "clock_in": None, "clock_out": None,
                                  "leave_reason": "Family holiday"}
