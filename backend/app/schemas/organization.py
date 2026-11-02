from datetime import datetime
from typing import Literal
from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

from pydantic import BaseModel, field_validator, model_validator

# Monday=0..Sunday=6, matching Python's date.weekday() — see
# repositories/organizations.py for the bitmask this maps to in storage.
Weekday = Literal[0, 1, 2, 3, 4, 5, 6]


class OrgSettings(BaseModel):
    working_days: list[Weekday]
    timezone: str


class UpdateOrgSettings(BaseModel):
    # Both optional so the settings UI can save working_days and timezone
    # independently (matching how Team.tsx saves each control the moment
    # it changes) without one PATCH clobbering the other's value.
    working_days: list[Weekday] | None = None
    timezone: str | None = None

    @field_validator("working_days")
    @classmethod
    def _at_least_one_day(cls, value: list[int] | None) -> list[int] | None:
        if value is not None and not value:
            raise ValueError("At least one working day is required")
        return sorted(set(value)) if value is not None else value

    @field_validator("timezone")
    @classmethod
    def _valid_iana_timezone(cls, value: str | None) -> str | None:
        if value is None:
            return value
        try:
            ZoneInfo(value)
        except (ZoneInfoNotFoundError, ValueError) as exc:
            raise ValueError(f"{value!r} is not a recognized IANA timezone name") from exc
        return value

    @model_validator(mode="after")
    def _at_least_one_field(self) -> "UpdateOrgSettings":
        if self.working_days is None and self.timezone is None:
            raise ValueError("Provide working_days and/or timezone")
        return self


class RoleCounts(BaseModel):
    staff: int
    admin: int
    super_admin: int


class Organization(BaseModel):
    # Company page payload: org identity plus the same working_days/timezone
    # OrgSettings exposes, so the page needs a single read.
    id: str
    name: str
    plan: str
    created_at: datetime
    working_days: list[Weekday]
    timezone: str
    member_counts: RoleCounts


ORG_NAME_MAX_LENGTH = 100


class RenameOrganization(BaseModel):
    name: str

    @field_validator("name")
    @classmethod
    def _trimmed_and_bounded(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("Organization name can't be blank")
        if len(value) > ORG_NAME_MAX_LENGTH:
            raise ValueError(f"Organization name must be at most {ORG_NAME_MAX_LENGTH} characters")
        return value
