from pydantic import BaseModel


class SignupRequest(BaseModel):
    org_name: str
    admin_name: str


class InviteRequest(BaseModel):
    email: str
    name: str


class UserProfile(BaseModel):
    id: str
    org_id: str
    role: str
    name: str
    email: str
