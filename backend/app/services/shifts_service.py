import re

from postgrest.exceptions import APIError
from supabase import Client

from app.repositories.organizations import OrganizationsRepository
from app.repositories.shifts import ShiftsRepository
from app.repositories.users import UsersRepository

HHMM = re.compile(r"^([01]\d|2[0-3]):[0-5]\d$")


class ShiftValidationError(Exception):
    pass


class TemplateNotFoundError(Exception):
    pass


class TemplateInUseError(Exception):
    def __init__(self, people: int):
        super().__init__(people)
        self.people = people


class MemberNotFoundError(Exception):
    pass


class TemplateNameTakenError(Exception):
    pass


class DemoOrgShiftsBlockedError(Exception):
    """The demo org's admin login is public, so its shifts stay as seeded."""


def hhmm(value: str) -> str:
    """Postgres `time` ("08:00:00") → "08:00"."""
    return value[:5]


def validate_times(start: str, end: str) -> None:
    if not HHMM.match(start or "") or not HHMM.match(end or ""):
        raise ShiftValidationError("Times must be 24-hour HH:MM, e.g. 08:00")
    if end <= start:
        # Same-day shifts only for now; night shifts that cross midnight are a follow-up.
        raise ShiftValidationError("The shift has to end after it starts, on the same day")


def resolve_shift(assignment: dict | None) -> dict | None:
    """An assignment row (template embedded) → the shift it means, or None."""
    if not assignment:
        return None
    template = assignment.get("template")
    if assignment.get("template_id") and template:
        return {"kind": "template", "template_id": assignment["template_id"], "name": template["name"],
                "start": hhmm(template["start_time"]), "end": hhmm(template["end_time"])}
    if assignment.get("custom_start") and assignment.get("custom_end"):
        return {"kind": "custom", "template_id": None, "name": "Custom",
                "start": hhmm(assignment["custom_start"]), "end": hhmm(assignment["custom_end"])}
    return None


class _name_taken:
    """Turns the unique (org_id, name) violation into TemplateNameTakenError."""

    def __enter__(self):
        return self

    def __exit__(self, exc_type, exc, tb):
        if isinstance(exc, APIError) and exc.code == "23505":
            raise TemplateNameTakenError() from exc
        return False


class ShiftsService:
    """Admins and super admins manage shift templates and choose, per
    person, a template, custom times or no shift. Everything runs on the
    caller's user-scoped client, so RLS confines it to their org."""

    def __init__(self, user_client: Client):
        self._shifts = ShiftsRepository(user_client)
        self._users = UsersRepository(user_client)
        self._orgs = OrganizationsRepository(user_client)

    def _guard_writes(self, org_id: str) -> None:
        if self._orgs.get(org_id)["plan"] == "demo":
            raise DemoOrgShiftsBlockedError()

    def list_templates(self) -> list[dict]:
        usage: dict[str, int] = {}
        for assignment in self._shifts.list_assignments():
            if assignment.get("template_id"):
                usage[assignment["template_id"]] = usage.get(assignment["template_id"], 0) + 1
        return [self._template_out(t, usage.get(t["id"], 0)) for t in self._shifts.list_templates()]

    def create_template(self, org_id: str, name: str, start: str, end: str) -> dict:
        self._guard_writes(org_id)
        name = self._clean_name(name)
        validate_times(start, end)
        with _name_taken():
            created = self._shifts.create_template(org_id, name, start, end)
        return self._template_out(created, 0)

    def update_template(self, org_id: str, template_id: str, name: str, start: str, end: str) -> dict:
        self._guard_writes(org_id)
        name = self._clean_name(name)
        validate_times(start, end)
        with _name_taken():
            updated = self._shifts.update_template(template_id, {"name": name, "start_time": start, "end_time": end})
        if updated is None:
            raise TemplateNotFoundError()
        people = sum(1 for a in self._shifts.list_assignments() if a.get("template_id") == template_id)
        return self._template_out(updated, people)

    def delete_template(self, org_id: str, template_id: str) -> None:
        self._guard_writes(org_id)
        if self._shifts.get_template(template_id) is None:
            raise TemplateNotFoundError()
        people = sum(1 for a in self._shifts.list_assignments() if a.get("template_id") == template_id)
        if people:
            raise TemplateInUseError(people)
        self._shifts.delete_template(template_id)

    def list_people(self) -> list[dict]:
        by_user = {a["user_id"]: a for a in self._shifts.list_assignments()}
        return [
            {"user_id": m["id"], "name": m["name"], "role": m["role"], "shift": resolve_shift(by_user.get(m["id"]))}
            for m in self._users.list_for_org()
        ]

    def set_person_shift(self, profile: dict, user_id: str, mode: str, template_id: str | None,
                         start: str | None, end: str | None) -> dict | None:
        self._guard_writes(profile["org_id"])
        if not any(m["id"] == user_id for m in self._users.list_for_org()):
            raise MemberNotFoundError()
        if mode == "none":
            self._shifts.clear_assignment(user_id)
            return None
        if mode == "template":
            if not template_id or self._shifts.get_template(template_id) is None:
                raise TemplateNotFoundError()
            self._shifts.set_assignment(profile["org_id"], user_id, profile["id"], template_id, None, None)
        elif mode == "custom":
            validate_times(start or "", end or "")
            self._shifts.set_assignment(profile["org_id"], user_id, profile["id"], None, start, end)
        else:
            raise ShiftValidationError("Choose no shift, a template or custom times")
        return resolve_shift(self._shifts.get_assignment(user_id))

    @staticmethod
    def _clean_name(name: str) -> str:
        name = (name or "").strip()
        if not 1 <= len(name) <= 60:
            raise ShiftValidationError("Give the shift a name (up to 60 characters)")
        return name

    @staticmethod
    def _template_out(row: dict, people: int) -> dict:
        return {"id": row["id"], "name": row["name"], "start": hhmm(row["start_time"]),
                "end": hhmm(row["end_time"]), "people": people}
