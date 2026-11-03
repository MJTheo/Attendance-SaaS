from pydantic import BaseModel


class Notifications(BaseModel):
    # Approval queues waiting on the caller (admins only; always 0 for staff).
    leave_approvals: int
    correction_approvals: int
    profile_changes: int
    # The caller's own missed clock-outs (last 30 days) with no correction
    # filed yet — anyone can have these.
    missed_clockouts: int
    total: int
