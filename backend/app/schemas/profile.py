import re
from datetime import datetime
from typing import Any

from pydantic import BaseModel, field_validator, model_validator

NAME_MAX_LENGTH = 100
EMAIL_MAX_LENGTH = 254
# Deliberately loose (one @, a dot in the domain, no spaces): Supabase Auth is
# the real validator when the confirmation email is requested, and the user
# has to receive mail there anyway.
_EMAIL_PATTERN = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]+$")


class ProfileEditCreate(BaseModel):
    name: str | None = None
    email: str | None = None
    reason: str

    @field_validator("name")
    @classmethod
    def _valid_name(cls, value: str | None) -> str | None:
        if value is None:
            return value
        value = value.strip()
        if not value:
            raise ValueError("Name can't be blank")
        if len(value) > NAME_MAX_LENGTH:
            raise ValueError(f"Name must be at most {NAME_MAX_LENGTH} characters")
        return value

    @field_validator("email")
    @classmethod
    def _valid_email(cls, value: str | None) -> str | None:
        if value is None:
            return value
        value = value.strip().lower()
        if len(value) > EMAIL_MAX_LENGTH or not _EMAIL_PATTERN.match(value):
            raise ValueError("Enter a valid email address")
        return value

    @field_validator("reason")
    @classmethod
    def _reason_required(cls, value: str) -> str:
        value = value.strip()
        if not value:
            raise ValueError("Give a reason for the change")
        return value

    @model_validator(mode="after")
    def _at_least_one_field(self) -> "ProfileEditCreate":
        if self.name is None and self.email is None:
            raise ValueError("Request a new name and/or email")
        return self


class ProfileEditRequest(BaseModel):
    id: str
    org_id: str
    user_id: str
    user_name: str | None = None
    requested_by: str
    approved_by: str | None
    reason: str
    old_value: dict[str, Any]
    new_value: dict[str, Any]
    status: str
    created_at: datetime
    resolved_at: datetime | None
    # Approved email change whose confirmation link hasn't been clicked yet
    # (the login email still differs from the approved one).
    awaiting_email_confirmation: bool = False
