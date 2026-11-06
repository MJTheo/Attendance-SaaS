from datetime import date, datetime

from pydantic import BaseModel


class StreakResponse(BaseModel):
    current_streak: int


class UserAnalyticsSummary(BaseModel):
    user_id: str
    name: str
    present: int
    late: int
    early_leave: int
    missed_clockout: int = 0
    absent: int
    total: int
    # late ÷ days clocked in (present, late, early leave, missed clock-out)
    late_rate: float


class WeekdayLateRate(BaseModel):
    weekday: str
    total: int
    late: int
    late_rate: float


class StatusDistribution(BaseModel):
    present: int
    late: int
    early_leave: int
    absent: int
    sick_leave: int
    annual_leave: int
    missed_clockout: int = 0


class DayStatusCounts(BaseModel):
    date: str
    present: int
    late: int
    early_leave: int
    absent: int
    sick_leave: int
    annual_leave: int
    missed_clockout: int = 0
    present_rate: float | None = None


class WeekSummary(BaseModel):
    week_start: date
    week_end: date
    # The current week, still in progress.
    partial: bool
    present: int
    late: int
    early_leave: int
    missed_clockout: int
    absent: int
    sick_leave: int
    annual_leave: int
    present_rate: float | None


class PersonWeek(BaseModel):
    week_start: date
    absent: int
    early_leave: int


class PersonWeeks(BaseModel):
    user_id: str
    name: str
    weeks: list[PersonWeek]


class CalendarDay(BaseModel):
    date: str
    status: str | None
    clock_in: datetime | None = None
    clock_out: datetime | None = None
    leave_reason: str | None = None


class DayDetail(BaseModel):
    date: str
    status: str | None
    clock_in: datetime | None = None
    clock_out: datetime | None = None
    notes: str | None = None
    leave_type: str | None = None
    leave_reason: str | None = None


class TeamDayDetail(DayDetail):
    user_id: str
    name: str


class TeamAnalytics(BaseModel):
    users: list[UserAnalyticsSummary]
    by_weekday: list[WeekdayLateRate]
    distribution: StatusDistribution
    trend: list[DayStatusCounts]
    # The last 8 Monday-start weeks, oldest first (the last one in progress).
    weeks: list[WeekSummary]
    weeks_by_person: list[PersonWeeks]


class Report(BaseModel):
    id: str
    org_id: str
    type: str
    generated_at: datetime
    payload: dict
