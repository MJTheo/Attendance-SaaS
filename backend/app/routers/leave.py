from fastapi import APIRouter, Depends, HTTPException, status
from supabase import Client

from app.core.security import CurrentUser, decode_current_user
from app.dependencies import get_user_client, require_admin, require_profile
from app.schemas.leave import LeaveRequest, LeaveRequestCreate
from app.services.leave_service import LeaveAlreadyResolvedError, LeaveNotFoundError, LeaveService

router = APIRouter(prefix="/leave", tags=["leave"])


@router.post("", response_model=LeaveRequest, status_code=status.HTTP_201_CREATED)
def request_leave(
    payload: LeaveRequestCreate,
    current_user: CurrentUser = Depends(decode_current_user),
    user_client: Client = Depends(get_user_client),
    profile: dict = Depends(require_profile),
):
    service = LeaveService(user_client)
    return service.request_leave(profile["org_id"], current_user.id, payload)


@router.get("", response_model=list[LeaveRequest])
def list_leave(
    user_client: Client = Depends(get_user_client),
    profile: dict = Depends(require_profile),
):
    return LeaveService(user_client).list_leave_requests()


@router.patch("/{leave_id}/approve", response_model=LeaveRequest)
def approve_leave(
    leave_id: str,
    current_user: CurrentUser = Depends(decode_current_user),
    user_client: Client = Depends(get_user_client),
    admin: dict = Depends(require_admin),
):
    service = LeaveService(user_client)
    try:
        return service.resolve(leave_id, current_user.id, approve=True)
    except LeaveNotFoundError as exc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Leave request not found") from exc
    except LeaveAlreadyResolvedError as exc:
        raise HTTPException(status.HTTP_409_CONFLICT, "Leave request already resolved") from exc


@router.patch("/{leave_id}/reject", response_model=LeaveRequest)
def reject_leave(
    leave_id: str,
    current_user: CurrentUser = Depends(decode_current_user),
    user_client: Client = Depends(get_user_client),
    admin: dict = Depends(require_admin),
):
    service = LeaveService(user_client)
    try:
        return service.resolve(leave_id, current_user.id, approve=False)
    except LeaveNotFoundError as exc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Leave request not found") from exc
    except LeaveAlreadyResolvedError as exc:
        raise HTTPException(status.HTTP_409_CONFLICT, "Leave request already resolved") from exc
