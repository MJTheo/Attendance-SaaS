from fastapi import APIRouter, Depends, HTTPException, status
from supabase import Client

from app.core.security import CurrentUser, decode_current_user
from app.dependencies import get_user_client, require_profile
from app.repositories.attendance import AttendanceRepository
from app.repositories.organizations import OrganizationsRepository
from app.schemas.analytics import StreakResponse
from app.schemas.attendance import AttendanceRecord, ClockOutRequest
from app.services.analytics_service import compute_streak
from app.services.attendance_service import (
    AlreadyClockedInError,
    AttendanceService,
    NoOpenRecordError,
)

router = APIRouter(prefix="/attendance", tags=["attendance"])


@router.post("/clock-in", response_model=AttendanceRecord, status_code=status.HTTP_201_CREATED)
def clock_in(
    current_user: CurrentUser = Depends(decode_current_user),
    user_client: Client = Depends(get_user_client),
    profile: dict = Depends(require_profile),
):
    service = AttendanceService(AttendanceRepository(user_client))
    try:
        return service.clock_in(profile["org_id"], current_user.id)
    except AlreadyClockedInError as exc:
        raise HTTPException(status.HTTP_409_CONFLICT, "Already clocked in") from exc


@router.patch("/clock-out", response_model=AttendanceRecord)
def clock_out(
    payload: ClockOutRequest,
    current_user: CurrentUser = Depends(decode_current_user),
    user_client: Client = Depends(get_user_client),
):
    service = AttendanceService(AttendanceRepository(user_client))
    try:
        return service.clock_out(current_user.id, payload.notes)
    except NoOpenRecordError as exc:
        raise HTTPException(status.HTTP_409_CONFLICT, "No open clock-in to close") from exc


@router.get("/me", response_model=list[AttendanceRecord])
def my_history(
    current_user: CurrentUser = Depends(decode_current_user),
    user_client: Client = Depends(get_user_client),
):
    service = AttendanceService(AttendanceRepository(user_client))
    return service.history(current_user.id)


@router.get("/streak", response_model=StreakResponse)
def my_streak(
    current_user: CurrentUser = Depends(decode_current_user),
    user_client: Client = Depends(get_user_client),
    profile: dict = Depends(require_profile),
):
    org = OrganizationsRepository(user_client).get(profile["org_id"])
    records = AttendanceRepository(user_client).list_for_user(current_user.id, 400)
    return {"current_streak": compute_streak(records, org["working_days"])}
