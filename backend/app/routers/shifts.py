from fastapi import APIRouter, Depends, HTTPException, Response, status
from supabase import Client

from app.dependencies import get_user_client, require_admin
from app.schemas.shifts import PersonShift, SetPersonShift, Shift, ShiftTemplate, ShiftTemplateIn
from app.services.shifts_service import (
    DemoOrgShiftsBlockedError,
    MemberNotFoundError,
    ShiftsService,
    ShiftValidationError,
    TemplateInUseError,
    TemplateNameTakenError,
    TemplateNotFoundError,
)

# Admins and super admins only. Staff see their own shift through /auth/me.
router = APIRouter(prefix="/shifts", tags=["shifts"])


def _errors(exc: Exception) -> HTTPException:
    if isinstance(exc, DemoOrgShiftsBlockedError):
        return HTTPException(status.HTTP_403_FORBIDDEN, "Shifts are read-only in the demo organization")
    if isinstance(exc, ShiftValidationError):
        return HTTPException(422, str(exc))
    if isinstance(exc, TemplateNameTakenError):
        return HTTPException(status.HTTP_409_CONFLICT, "There's already a shift with that name")
    if isinstance(exc, TemplateInUseError):
        who = "1 person is" if exc.people == 1 else f"{exc.people} people are"
        return HTTPException(status.HTTP_409_CONFLICT, f"{who} on this shift — move them to another shift first")
    if isinstance(exc, TemplateNotFoundError):
        return HTTPException(status.HTTP_404_NOT_FOUND, "Shift template not found")
    if isinstance(exc, MemberNotFoundError):
        return HTTPException(status.HTTP_404_NOT_FOUND, "Team member not found")
    raise exc


ERRORS = (DemoOrgShiftsBlockedError, ShiftValidationError, TemplateNameTakenError, TemplateInUseError,
          TemplateNotFoundError, MemberNotFoundError)


@router.get("/templates", response_model=list[ShiftTemplate])
def list_templates(user_client: Client = Depends(get_user_client), admin: dict = Depends(require_admin)):
    return ShiftsService(user_client).list_templates()


@router.post("/templates", response_model=ShiftTemplate, status_code=status.HTTP_201_CREATED)
def create_template(payload: ShiftTemplateIn, user_client: Client = Depends(get_user_client),
                    admin: dict = Depends(require_admin)):
    try:
        return ShiftsService(user_client).create_template(admin["org_id"], payload.name, payload.start, payload.end)
    except ERRORS as exc:
        raise _errors(exc) from exc


@router.patch("/templates/{template_id}", response_model=ShiftTemplate)
def update_template(template_id: str, payload: ShiftTemplateIn, user_client: Client = Depends(get_user_client),
                    admin: dict = Depends(require_admin)):
    try:
        return ShiftsService(user_client).update_template(admin["org_id"], template_id, payload.name, payload.start, payload.end)
    except ERRORS as exc:
        raise _errors(exc) from exc


@router.delete("/templates/{template_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_template(template_id: str, user_client: Client = Depends(get_user_client),
                    admin: dict = Depends(require_admin)):
    try:
        ShiftsService(user_client).delete_template(admin["org_id"], template_id)
    except ERRORS as exc:
        raise _errors(exc) from exc
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/people", response_model=list[PersonShift])
def list_people(user_client: Client = Depends(get_user_client), admin: dict = Depends(require_admin)):
    return ShiftsService(user_client).list_people()


@router.put("/people/{user_id}", response_model=Shift | None)
def set_person_shift(user_id: str, payload: SetPersonShift, user_client: Client = Depends(get_user_client),
                     admin: dict = Depends(require_admin)):
    try:
        return ShiftsService(user_client).set_person_shift(
            admin, user_id, payload.mode, payload.template_id, payload.start, payload.end)
    except ERRORS as exc:
        raise _errors(exc) from exc
