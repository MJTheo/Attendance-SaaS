from typing import Literal

from pydantic import BaseModel, field_validator

# Monday=0..Sunday=6, matching Python's date.weekday() — see
# repositories/organizations.py for the bitmask this maps to in storage.
Weekday = Literal[0, 1, 2, 3, 4, 5, 6]


class OrgSettings(BaseModel):
    working_days: list[Weekday]


class UpdateOrgSettings(BaseModel):
    working_days: list[Weekday]

    @field_validator("working_days")
    @classmethod
    def _at_least_one_day(cls, value: list[int]) -> list[int]:
        if not value:
            raise ValueError("At least one working day is required")
        return sorted(set(value))
