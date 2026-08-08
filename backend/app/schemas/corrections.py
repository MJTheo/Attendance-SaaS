from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, model_validator

AttendanceStatus = Literal["present", "late", "early_leave", "absent", "missed_clockout"]


class CorrectionFields(BaseModel):
    clock_in: datetime | None = None
    clock_out: datetime | None = None
    status: AttendanceStatus | None = None
    notes: str | None = None


class CorrectionRequest(BaseModel):
    attendance_record_id: str
    reason: str
    new_value: CorrectionFields

    @model_validator(mode="after")
    def require_at_least_one_field(self) -> "CorrectionRequest":
        if not self.new_value.model_dump(exclude_none=True):
            raise ValueError("new_value must set at least one field")
        return self


class Correction(BaseModel):
    id: str
    attendance_record_id: str
    org_id: str
    requested_by: str
    approved_by: str | None
    reason: str
    old_value: dict[str, Any]
    new_value: dict[str, Any]
    status: str
    created_at: datetime
    resolved_at: datetime | None
