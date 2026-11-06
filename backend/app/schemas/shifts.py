from typing import Literal

from pydantic import BaseModel

from app.schemas.user import Role


class Shift(BaseModel):
    """A person's resolved shift: a template's name and times, or "Custom"."""

    kind: Literal["template", "custom"]
    template_id: str | None
    name: str
    start: str  # "HH:MM", org time
    end: str


class ShiftTemplate(BaseModel):
    id: str
    name: str
    start: str
    end: str
    # How many people are on it; a template in use can't be deleted.
    people: int


class ShiftTemplateIn(BaseModel):
    name: str
    start: str
    end: str


class PersonShift(BaseModel):
    user_id: str
    name: str
    role: Role
    shift: Shift | None


class SetPersonShift(BaseModel):
    mode: Literal["none", "template", "custom"]
    template_id: str | None = None
    start: str | None = None
    end: str | None = None
