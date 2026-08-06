from collections import defaultdict
from datetime import date, datetime, timedelta

WEEKDAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]


def _to_date(value: str | datetime) -> date:
    if isinstance(value, datetime):
        return value.date()
    return datetime.fromisoformat(value).date()


def compute_streak(records: list[dict]) -> int:
    """Consecutive most-recent calendar days with at least one non-absent
    record, no gaps. Grounded only in records that actually exist — there's
    no shift-schedule concept yet (see AttendanceService._determine_clock_in_status),
    so a day with no record at all isn't assumed to be a missed workday,
    with one narrow exception: weekends (Sat/Sun) are skipped when checking
    for a gap rather than treated as a missed day, since assuming *every*
    day is a workday is itself an unstated schedule assumption — and the
    wrong one for the common case."""
    dates_seen: set[date] = set()
    attended_dates: set[date] = set()
    for record in records:
        day = _to_date(record["clock_in"])
        dates_seen.add(day)
        if record["status"] != "absent":
            attended_dates.add(day)

    if not dates_seen:
        return 0

    streak = 0
    cursor = max(dates_seen)
    while True:
        if cursor in attended_dates:
            streak += 1
        elif cursor.weekday() >= 5:
            pass  # weekend with nothing recorded — not a gap, keep walking back
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


def late_rate_by_weekday(team_records: list[dict]) -> list[dict]:
    totals: dict[int, int] = defaultdict(int)
    late: dict[int, int] = defaultdict(int)
    for record in team_records:
        weekday = _to_date(record["clock_in"]).weekday()
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
        for i in range(7)
    ]
