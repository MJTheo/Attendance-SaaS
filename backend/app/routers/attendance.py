from datetime import date, timedelta

from fastapi import APIRouter, Depends, HTTPException, status
from supabase import Client

from app.core.security import CurrentUser, decode_current_user
from app.dependencies import get_user_client, require_profile
from app.repositories.attendance import AttendanceRepository
from app.repositories.leave_requests import LeaveRequestsRepository
from app.repositories.organizations import OrganizationsRepository
from app.schemas.analytics import CalendarDay, DayDetail, StreakResponse
from app.schemas.attendance import AttendanceRecord, ClockOutRequest
from app.services.analytics_service import build_personal_calendar, compute_streak, day_detail_for_user, month_bounds
from app.services.attendance_service import (
    AlreadyClockedInError,
    AlreadyClockedTodayError,
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
    except AlreadyClockedTodayError as exc:
        raise HTTPException(
            status.HTTP_409_CONFLICT, "Already clocked in and out today — request a correction if this was a mistake"
        ) from exc


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


@router.get("/calendar", response_model=list[CalendarDay])
def my_calendar(
    year: int,
    month: int,
    current_user: CurrentUser = Depends(decode_current_user),
    user_client: Client = Depends(get_user_client),
):
    start, end = month_bounds(year, month)
    records = AttendanceRepository(user_client).list_for_user_range(
        current_user.id, start.isoformat(), (end + timedelta(days=1)).isoformat()
    )
    approved_leave = LeaveRequestsRepository(user_client).list_approved_in_range(
        start.isoformat(), end.isoformat()
    )
    return build_personal_calendar(
        records, [leave for leave in approved_leave if leave["user_id"] == current_user.id], start, end
    )


@router.get("/day/{day}", response_model=DayDetail)
def my_day(
    day: date,
    current_user: CurrentUser = Depends(decode_current_user),
    user_client: Client = Depends(get_user_client),
):
    records = AttendanceRepository(user_client).list_for_user_range(
        current_user.id, day.isoformat(), (day + timedelta(days=1)).isoformat()
    )
    approved_leave = LeaveRequestsRepository(user_client).list_approved_in_range(day.isoformat(), day.isoformat())
    return day_detail_for_user(
        records, [leave for leave in approved_leave if leave["user_id"] == current_user.id], current_user.id, day
    )
