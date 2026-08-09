from pydantic import BaseModel

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
