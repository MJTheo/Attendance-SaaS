from datetime import datetime

from pydantic import BaseModel


class StreakResponse(BaseModel):
    current_streak: int


class UserAnalyticsSummary(BaseModel):
    user_id: str
    name: str
    present: int
    late: int
    early_leave: int
    absent: int
    total: int
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


class DayStatusCounts(BaseModel):
    date: str
    present: int
    late: int
    early_leave: int
    absent: int
    sick_leave: int
    annual_leave: int


class CalendarDay(BaseModel):
    date: str
    status: str | None


class TeamAnalytics(BaseModel):
    users: list[UserAnalyticsSummary]
    by_weekday: list[WeekdayLateRate]
    distribution: StatusDistribution
    trend: list[DayStatusCounts]


class Report(BaseModel):
    id: str
    org_id: str
    type: str
    generated_at: datetime
    payload: dict
