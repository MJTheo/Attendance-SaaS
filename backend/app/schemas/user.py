from typing import Literal

from pydantic import BaseModel

Role = Literal["staff", "admin", "super_admin"]


class UpdateUserRole(BaseModel):
    role: Role
