from calendar import monthrange
from collections import defaultdict
from datetime import date, datetime, timedelta
from zoneinfo import ZoneInfo

WEEKDAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]

ATTENDANCE_STATUS_KEYS = ["present", "late", "early_leave", "absent"]
LEAVE_STATUS_KEYS = ["sick_leave", "annual_leave"]
ALL_STATUS_KEYS = ATTENDANCE_STATUS_KEYS + LEAVE_STATUS_KEYS


def org_timezone(org: dict) -> ZoneInfo:
    return ZoneInfo(org["timezone"])


def local_day_bounds(day: date, tz: ZoneInfo) -> tuple[datetime, datetime]:
    """[start, end) for one calendar day in the org's own timezone, as
    timezone-aware datetimes — the boundary to query attendance_records
    against, since "today" for an org is defined by its own clock, not
    UTC's or the server's."""
    start = datetime.combine(day, datetime.min.time(), tzinfo=tz)
    return start, start + timedelta(days=1)


def _to_date(value: str | datetime) -> date:
    """For date-only values (leave_requests.start_date/end_date) — no
    timezone conversion applies, there's no time component to convert."""
    if isinstance(value, datetime):
        return value.date()
    return datetime.fromisoformat(value).date()


def _to_local_date(value: str | datetime, tz: ZoneInfo) -> date:
    """For timestamptz values (attendance_records.clock_in) — which
    calendar day a moment falls on depends on the org's timezone, not the
    UTC offset the timestamp happens to be stored/returned in."""
    parsed = value if isinstance(value, datetime) else datetime.fromisoformat(value)
    return parsed.astimezone(tz).date()


def compute_streak(records: list[dict], working_days: set[int] | list[int], tz: ZoneInfo) -> int:
    """Consecutive most-recent calendar days (in the org's own timezone)
    with at least one non-absent record, no gaps. Grounded only in records
    that actually exist — there's no shift-schedule concept yet (see
    AttendanceService._determine_clock_in_status), so a day with no record
    at all isn't assumed to be a missed workday, with one narrow exception:
    non-working days (per the org's working_days — a set of weekday
    indices, Monday=0..Sunday=6) are skipped when checking for a gap rather
    than treated as a missed day, since assuming *every* day is a workday
    is itself an unstated schedule assumption — and the wrong one for orgs
    that don't run every weekday.

    The walk starts from today (or yesterday, if today has no record yet —
    so a streak isn't shown as broken mid-day before someone's had a chance
    to clock in) rather than from the latest date with *any* record. The
    closeout job used to auto-create an 'absent' row every day, which had
    the side effect of keeping recent days "seen" even with no real
    attendance — anchoring on `today` instead means the streak stays
    accurate now that it doesn't."""
    working_days = set(working_days)
    attended_dates: set[date] = set()
    for record in records:
        if record["status"] != "absent":
            attended_dates.add(_to_local_date(record["clock_in"], tz))

    if not attended_dates:
        return 0

    today = datetime.now(tz).date()
    streak = 0
    cursor = today if today in attended_dates else today - timedelta(days=1)
    while True:
        if cursor in attended_dates:
            streak += 1
        elif cursor.weekday() not in working_days:
            pass  # non-working day with nothing recorded — not a gap, keep walking back
        else:
            break
        cursor -= timedelta(days=1)
    return streak


def summarize_users(team_records: list[dict]) -> list[dict]:
    """Per-user status breakdown across whatever records are passed in.
    team_records is expected in AttendanceRepository.list_for_org shape
    (includes a flattened user_name field)."""
    per_user: dict[str, dict] = {}
    for record in team_records:
        user_id = record["user_id"]
        entry = per_user.setdefault(
            user_id,
            {
                "user_id": user_id,
                "name": record.get("user_name", ""),
                "present": 0,
                "late": 0,
                "early_leave": 0,
                "absent": 0,
                "total": 0,
            },
        )
        entry[record["status"]] = entry.get(record["status"], 0) + 1
        entry["total"] += 1

    summaries = list(per_user.values())
    for entry in summaries:
        entry["late_rate"] = round(entry["late"] / entry["total"], 3) if entry["total"] else 0.0
    return summaries


def late_rate_by_weekday(team_records: list[dict], working_days: set[int] | list[int], tz: ZoneInfo) -> list[dict]:
    """Breakdown for the org's working weekday indices (Monday=0..Sunday=6)
    only — non-working days are dropped rather than rendered as an
    always-empty row."""
    totals: dict[int, int] = defaultdict(int)
    late: dict[int, int] = defaultdict(int)
    for record in team_records:
        weekday = _to_local_date(record["clock_in"], tz).weekday()
        totals[weekday] += 1
        if record["status"] == "late":
            late[weekday] += 1

    return [
        {
            "weekday": WEEKDAY_NAMES[i],
            "total": totals.get(i, 0),
            "late": late.get(i, 0),
            "late_rate": round(late.get(i, 0) / totals[i], 3) if totals.get(i) else 0.0,
        }
        for i in sorted(working_days)
    ]


def month_bounds(year: int, month: int) -> tuple[date, date]:
    last_day = monthrange(year, month)[1]
    return date(year, month, 1), date(year, month, last_day)


def _date_range(start: date, end: date):
    cursor = start
    while cursor <= end:
        yield cursor
        cursor += timedelta(days=1)


def _expand_leave_days(leave_requests: list[dict], start: date, end: date) -> dict[date, dict[str, int]]:
    """approved leave_requests -> per-day counts of sick_leave/annual_leave,
    clipped to [start, end]. leave_requests rows are expected already
    filtered to status == 'approved' (see LeaveRequestsRepository.list_approved_in_range)."""
    counts: dict[date, dict[str, int]] = defaultdict(lambda: {"sick_leave": 0, "annual_leave": 0})
    for leave in leave_requests:
        leave_start = max(_to_date(leave["start_date"]), start)
        leave_end = min(_to_date(leave["end_date"]), end)
        key = f"{leave['leave_type']}_leave"
        for day in _date_range(leave_start, leave_end):
            counts[day][key] += 1
    return counts


def daily_trend(records: list[dict], leave_requests: list[dict], start: date, end: date, tz: ZoneInfo) -> list[dict]:
    """One entry per calendar day in [start, end] with counts for every
    status (attendance + leave). Used both for the analytics trend chart and
    as the team calendar's per-day data — same shape serves both."""
    per_day_attendance: dict[date, dict[str, int]] = defaultdict(lambda: {k: 0 for k in ATTENDANCE_STATUS_KEYS})
    for record in records:
        day = _to_local_date(record["clock_in"], tz)
        if start <= day <= end:
            per_day_attendance[day][record["status"]] = per_day_attendance[day].get(record["status"], 0) + 1

    leave_days = _expand_leave_days(leave_requests, start, end)

    out = []
    for day in _date_range(start, end):
        entry = {"date": day.isoformat(), **{k: 0 for k in ALL_STATUS_KEYS}}
        entry.update(per_day_attendance.get(day, {}))
        for key, count in leave_days.get(day, {}).items():
            entry[key] += count
        out.append(entry)
    return out


def status_distribution(records: list[dict], leave_requests: list[dict], start: date, end: date, tz: ZoneInfo) -> dict:
    """Total count per status across [start, end] — org totals attendance
    + leave for the same window daily_trend covers, just summed instead of
    broken out by day."""
    totals = {k: 0 for k in ALL_STATUS_KEYS}
    for record in records:
        day = _to_local_date(record["clock_in"], tz)
        if start <= day <= end:
            totals[record["status"]] = totals.get(record["status"], 0) + 1
    for day_counts in _expand_leave_days(leave_requests, start, end).values():
        for key, count in day_counts.items():
            totals[key] += count
    return totals


def build_personal_calendar(
    records: list[dict], leave_requests: list[dict], start: date, end: date, tz: ZoneInfo
) -> list[dict]:
    """One entry per calendar day in [start, end] with a single status (or
    null if nothing happened that day). Approved leave overrides an
    attendance-derived status for the same day — an approved leave day is
    the more authoritative statement of what that day was."""
    status_by_day: dict[date, str] = {}
    for record in records:
        day = _to_local_date(record["clock_in"], tz)
        if start <= day <= end:
            status_by_day[day] = record["status"]

    for day, counts in _expand_leave_days(leave_requests, start, end).items():
        for key, count in counts.items():
            if count > 0:
                status_by_day[day] = key

    return [{"date": day.isoformat(), "status": status_by_day.get(day)} for day in _date_range(start, end)]


def day_detail_for_user(records: list[dict], leave_requests: list[dict], user_id: str, day: date, tz: ZoneInfo) -> dict:
    """Full detail (not just a status label) for one user on one day — backs
    the calendar's click-to-view popup. leave_requests is expected already
    filtered to this user's approved requests."""
    for leave in leave_requests:
        if leave["user_id"] != user_id:
            continue
        if _to_date(leave["start_date"]) <= day <= _to_date(leave["end_date"]):
            return {
                "date": day.isoformat(),
                "status": f"{leave['leave_type']}_leave",
                "clock_in": None,
                "clock_out": None,
                "notes": None,
                "leave_type": leave["leave_type"],
                "leave_reason": leave["reason"],
            }

    record = next(
        (r for r in records if r["user_id"] == user_id and _to_local_date(r["clock_in"], tz) == day),
        None,
    )
    if record:
        return {
            "date": day.isoformat(),
            "status": record["status"],
            "clock_in": record["clock_in"],
            "clock_out": record.get("clock_out"),
            "notes": record.get("notes"),
            "leave_type": None,
            "leave_reason": None,
        }

    return {
        "date": day.isoformat(),
        "status": None,
        "clock_in": None,
        "clock_out": None,
        "notes": None,
        "leave_type": None,
        "leave_reason": None,
    }


def day_detail_for_org(
    records: list[dict], leave_requests: list[dict], users: list[dict], day: date, tz: ZoneInfo
) -> list[dict]:
    return [
        {
            "user_id": user["id"],
            "name": user["name"],
            **day_detail_for_user(records, leave_requests, user["id"], day, tz),
        }
        for user in users
    ]
