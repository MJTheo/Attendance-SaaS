from datetime import datetime, timezone

import pytest

from app.config import Settings
from app.jobs.schedule import crontab_trigger

# Monday 2026-11-02 00:00 UTC — a fixed reference point.
START = datetime(2026, 11, 2, 0, 0, tzinfo=timezone.utc)


def next_fires(expression: str, count: int = 3) -> list[datetime]:
    trigger = crontab_trigger(expression, timezone="UTC")
    fires, previous, now = [], None, START
    for _ in range(count):
        fire = trigger.get_next_fire_time(previous, now)
        fires.append(fire)
        previous, now = fire, fire
    return fires


def weekdays(expression: str, count: int = 3) -> list[str]:
    return [fire.strftime("%a") for fire in next_fires(expression, count)]


def test_default_weekly_report_schedule_fires_on_monday():
    # Regression: APScheduler's own from_crontab reads "1" as Tuesday, so
    # production generated every weekly report on Tuesdays.
    expression = Settings.model_fields["report_schedule_cron"].default
    assert next_fires(expression, 2) == [
        datetime(2026, 11, 2, 6, 0, tzinfo=timezone.utc),
        datetime(2026, 11, 9, 6, 0, tzinfo=timezone.utc),
    ]


@pytest.mark.parametrize(
    "dow, expected",
    [
        ("0", ["Sun"] * 3),
        ("7", ["Sun"] * 3),
        ("6", ["Sat"] * 3),
        ("1-5", ["Mon", "Tue", "Wed"]),
        ("0,6", ["Sat", "Sun", "Sat"]),
        ("mon", ["Mon"] * 3),
        ("*", ["Mon", "Tue", "Wed"]),
    ],
)
def test_crontab_day_of_week_numbering(dow, expected):
    assert weekdays(f"0 6 * * {dow}") == expected


def test_explicit_day_list():
    assert weekdays("0 6 * * 1,3,5") == ["Mon", "Wed", "Fri"]


def test_daily_closeout_schedule_unchanged():
    expression = Settings.model_fields["daily_closeout_cron"].default
    assert next_fires(expression, 2) == [
        datetime(2026, 11, 2, 0, 10, tzinfo=timezone.utc),
        datetime(2026, 11, 3, 0, 10, tzinfo=timezone.utc),
    ]


@pytest.mark.parametrize(
    "expression",
    [
        "0 6 * * 8",  # out of range
        "0 6 * * 1-5/2",  # step: APScheduler would silently ignore it
        "0 6 * *",  # too few fields
        "0 6 * * 1 extra",  # too many fields
    ],
)
def test_invalid_expressions_rejected(expression):
    with pytest.raises(ValueError):
        crontab_trigger(expression)
