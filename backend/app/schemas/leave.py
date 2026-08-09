from datetime import date, datetime
from typing import Literal

from pydantic import BaseModel, model_validator

LeaveType = Literal["sick", "annual"]


class LeaveRequestCreate(BaseModel):
    leave_type: LeaveType
    start_date: date
    end_date: date
    reason: str

    @model_validator(mode="after")
    def validate_range(self) -> "LeaveRequestCreate":
        if self.end_date < self.start_date:
            raise ValueError("end_date must be on or after start_date")
        return self


class LeaveRequest(BaseModel):
    id: str
    org_id: str
    user_id: str
    leave_type: LeaveType
    start_date: date
    end_date: date
    reason: str
    status: str
    requested_by: str
    requested_by_name: str | None = None
    approved_by: str | None
    created_at: datetime
    resolved_at: datetime | None
