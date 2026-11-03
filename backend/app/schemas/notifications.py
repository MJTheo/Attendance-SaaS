from pydantic import BaseModel

from app.schemas.attendance import AttendanceRecord
from app.schemas.corrections import Correction
from app.schemas.leave import LeaveRequest
from app.schemas.profile import ProfileEditRequest


class Notifications(BaseModel):
    # Approval queues waiting on the caller (admins only; always 0 for staff).
    leave_approvals: int
    correction_approvals: int
    profile_changes: int
    # The caller's own missed clock-outs (last 30 days) with no correction
    # filed yet — anyone can have these.
    missed_clockouts: int
    total: int


class Inbox(BaseModel):
    """The items behind the counts above, oldest first."""

    leave: list[LeaveRequest]
    corrections: list[Correction]
    profile_changes: list[ProfileEditRequest]
    missed_clockouts: list[AttendanceRecord]
