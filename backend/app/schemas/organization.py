from typing import Literal

from pydantic import BaseModel

WorkingDays = Literal[5, 6, 7]


class OrgSettings(BaseModel):
    working_days: WorkingDays


class UpdateOrgSettings(BaseModel):
    working_days: WorkingDays
