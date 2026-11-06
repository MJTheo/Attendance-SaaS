from pydantic import BaseModel

from app.schemas.shifts import Shift
from app.schemas.user import Role


class SignupRequest(BaseModel):
    org_name: str
    admin_name: str
    access_code: str


class InviteRequest(BaseModel):
    email: str
    name: str


class UserProfile(BaseModel):
    id: str
    org_id: str
    role: Role
    name: str
    email: str


class Me(UserProfile):
    # The caller's own org, so every role's shell can show the org name,
    # the demo-org note (plan == "demo") and dates in the org's timezone —
    # staff can't call /admin/organization.
    org_name: str
    org_plan: str
    org_timezone: str
    # Monday=0..Sunday=6 — the calendar hatches the other days as "Off".
    org_working_days: list[int]
    # The caller's own shift (template or custom times), or None.
    shift: Shift | None = None
