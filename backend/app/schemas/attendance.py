from datetime import datetime

from pydantic import BaseModel


class AttendanceRecord(BaseModel):
    id: str
    org_id: str
    user_id: str
    clock_in: datetime
    clock_out: datetime | None
    status: str
    notes: str | None


class ClockOutRequest(BaseModel):
    notes: str | None = None


class TeamAttendanceRecord(AttendanceRecord):
    user_name: str
