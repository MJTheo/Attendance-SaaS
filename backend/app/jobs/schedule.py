import re

from apscheduler.triggers.cron import CronTrigger

# Standard crontab numbers days of the week 0-7 with Sunday as 0 (and 7).
# APScheduler 3's CronTrigger numbers them 0-6 with *Monday* as 0, and
# CronTrigger.from_crontab passes the field through untranslated — so
# "0 6 * * 1" (Monday in crontab) silently fires on Tuesday. Day names mean
# the same thing in both, so numeric days are rewritten to names before
# handing the expression to APScheduler. Values already set in the
# environment (e.g. REPORT_SCHEDULE_CRON=0 6 * * 1) keep their crontab
# meaning without any config change.
_CRONTAB_DAY_NAMES = ["sun", "mon", "tue", "wed", "thu", "fri", "sat", "sun"]


def _translate_day_of_week(field: str) -> str:
    # APScheduler 3 silently drops a step on a named weekday range
    # ("mon-fri/2" fires every weekday), so a step here would quietly run on
    # the wrong days. Refuse it instead — list the days explicitly ("1,3,5").
    if "/" in field:
        raise ValueError(f"Steps aren't supported in the day-of-week field ({field!r}); list the days instead")
    return re.sub(r"\d+", lambda m: _day_name(int(m.group())), field)


def _day_name(number: int) -> str:
    if not 0 <= number <= 7:
        raise ValueError(f"Day of week {number} is out of range (crontab uses 0-7, Sunday = 0 or 7)")
    return _CRONTAB_DAY_NAMES[number]


def crontab_trigger(expression: str, timezone=None) -> CronTrigger:
    """CronTrigger from a standard 5-field crontab expression, with crontab's
    day-of-week numbering (Sunday = 0) rather than APScheduler's (Monday = 0)."""
    fields = expression.split()
    if len(fields) != 5:
        raise ValueError(f"Expected 5 crontab fields, got {len(fields)}: {expression!r}")
    fields[4] = _translate_day_of_week(fields[4])
    return CronTrigger.from_crontab(" ".join(fields), timezone=timezone)
