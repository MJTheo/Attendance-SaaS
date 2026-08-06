from fastapi import APIRouter, Depends, HTTPException, status
from supabase import Client

from app.core.security import CurrentUser, decode_current_user
from app.dependencies import get_service_role_client, get_user_client, require_admin, require_profile
from app.schemas.corrections import Correction, CorrectionRequest
from app.services.corrections_service import (
    AttendanceRecordNotFoundError,
    CorrectionAlreadyResolvedError,
    CorrectionNotFoundError,
    CorrectionsService,
)

router = APIRouter(prefix="/corrections", tags=["corrections"])


@router.post("", response_model=Correction, status_code=status.HTTP_201_CREATED)
def request_correction(
    payload: CorrectionRequest,
    current_user: CurrentUser = Depends(decode_current_user),
    user_client: Client = Depends(get_user_client),
    profile: dict = Depends(require_profile),
):
    service = CorrectionsService(user_client, get_service_role_client())
    new_value = payload.new_value.model_dump(exclude_none=True, mode="json")
    try:
        return service.request_correction(
            profile["org_id"], current_user.id, payload.attendance_record_id, payload.reason, new_value
        )
    except AttendanceRecordNotFoundError as exc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Attendance record not found") from exc


@router.get("", response_model=list[Correction])
def list_corrections(
    user_client: Client = Depends(get_user_client),
    profile: dict = Depends(require_profile),
):
    service = CorrectionsService(user_client, get_service_role_client())
    return service.list_corrections()


@router.patch("/{correction_id}/approve", response_model=Correction)
def approve_correction(
    correction_id: str,
    current_user: CurrentUser = Depends(decode_current_user),
    user_client: Client = Depends(get_user_client),
    admin: dict = Depends(require_admin),
):
    service = CorrectionsService(user_client, get_service_role_client())
    try:
        return service.resolve(correction_id, current_user.id, approve=True)
    except CorrectionNotFoundError as exc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Correction not found") from exc
    except CorrectionAlreadyResolvedError as exc:
        raise HTTPException(status.HTTP_409_CONFLICT, "Correction already resolved") from exc


@router.patch("/{correction_id}/reject", response_model=Correction)
def reject_correction(
    correction_id: str,
    current_user: CurrentUser = Depends(decode_current_user),
    user_client: Client = Depends(get_user_client),
    admin: dict = Depends(require_admin),
):
    service = CorrectionsService(user_client, get_service_role_client())
    try:
        return service.resolve(correction_id, current_user.id, approve=False)
    except CorrectionNotFoundError as exc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Correction not found") from exc
    except CorrectionAlreadyResolvedError as exc:
        raise HTTPException(status.HTTP_409_CONFLICT, "Correction already resolved") from exc
