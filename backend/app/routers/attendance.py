from datetime import date, datetime

from fastapi import APIRouter, Depends, HTTPException, status
from supabase import Client

from app.core.security import CurrentUser, decode_current_user
from app.dependencies import get_service_role_client, get_user_client, require_profile
from app.repositories.attendance import AttendanceRepository
from app.repositories.leave_requests import LeaveRequestsRepository
from app.repositories.organizations import OrganizationsRepository
from app.repositories.shifts import ShiftsRepository
from app.schemas.analytics import CalendarDay, DayDetail, StreakResponse
from app.schemas.attendance import AttendanceRecord, ClockOutRequest
from app.services.analytics_service import (
    build_personal_calendar,
    compute_streak,
    day_detail_for_user,
    local_day_bounds,
    month_bounds,
    org_timezone,
)
from app.services.attendance_service import (
    AlreadyClockedInError,
    AlreadyClockedTodayError,
    AttendanceService,
    NoOpenRecordError,
)
from app.services.shifts_service import resolve_shift

router = APIRouter(prefix="/attendance", tags=["attendance"])


def _service_and_context(user_client: Client, profile: dict):
    """The attendance service (reads as the caller, writes with the service
    role — staff have no direct write access to attendance_records) plus
    what the status rules need: the org's timezone and working days, and the
    caller's own shift, if they have one."""
    org = OrganizationsRepository(user_client).get(profile["org_id"])
    shift = resolve_shift(ShiftsRepository(user_client).get_assignment(profile["id"]))
    service = AttendanceService(AttendanceRepository(user_client), AttendanceRepository(get_service_role_client()))
    return service, org_timezone(org), org["working_days"], shift


@router.post("/clock-in", response_model=AttendanceRecord, status_code=status.HTTP_201_CREATED)
def clock_in(
    user_client: Client = Depends(get_user_client),
    profile: dict = Depends(require_profile),
):
    service, tz, working_days, shift = _service_and_context(user_client, profile)
    try:
        return service.clock_in(profile["org_id"], profile["id"], tz, shift, working_days)
    except AlreadyClockedInError as exc:
        raise HTTPException(status.HTTP_409_CONFLICT, "Already clocked in") from exc
    except AlreadyClockedTodayError as exc:
        raise HTTPException(
            status.HTTP_409_CONFLICT, "Already clocked in and out today — request a correction if this was a mistake"
        ) from exc


@router.patch("/clock-out", response_model=AttendanceRecord)
def clock_out(
    payload: ClockOutRequest,
    user_client: Client = Depends(get_user_client),
    profile: dict = Depends(require_profile),
):
    service, tz, working_days, shift = _service_and_context(user_client, profile)
    try:
        return service.clock_out(profile["id"], payload.notes, tz, shift, working_days)
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
    return {"current_streak": compute_streak(records, org["working_days"], org_timezone(org))}


@router.get("/calendar", response_model=list[CalendarDay])
def my_calendar(
    year: int,
    month: int,
    current_user: CurrentUser = Depends(decode_current_user),
    user_client: Client = Depends(get_user_client),
    profile: dict = Depends(require_profile),
):
    org = OrganizationsRepository(user_client).get(profile["org_id"])
    tz = org_timezone(org)
    start, end = month_bounds(year, month)
    range_start, _ = local_day_bounds(start, tz)
    _, range_end = local_day_bounds(end, tz)
    records = AttendanceRepository(user_client).list_for_user_range(
        current_user.id, range_start.isoformat(), range_end.isoformat()
    )
    approved_leave = LeaveRequestsRepository(user_client).list_approved_in_range(
        start.isoformat(), end.isoformat()
    )
    return build_personal_calendar(
        records, [leave for leave in approved_leave if leave["user_id"] == current_user.id], start, end, tz
    )


@router.get("/day/{day}", response_model=DayDetail)
def my_day(
    day: date,
    current_user: CurrentUser = Depends(decode_current_user),
    user_client: Client = Depends(get_user_client),
    profile: dict = Depends(require_profile),
):
    org = OrganizationsRepository(user_client).get(profile["org_id"])
    tz = org_timezone(org)
    range_start, range_end = local_day_bounds(day, tz)
    records = AttendanceRepository(user_client).list_for_user_range(
        current_user.id, range_start.isoformat(), range_end.isoformat()
    )
    approved_leave = LeaveRequestsRepository(user_client).list_approved_in_range(day.isoformat(), day.isoformat())
    return day_detail_for_user(
        records, [leave for leave in approved_leave if leave["user_id"] == current_user.id], current_user.id, day, tz
    )


@router.get("/today", response_model=DayDetail)
def my_today(
    current_user: CurrentUser = Depends(decode_current_user),
    user_client: Client = Depends(get_user_client),
    profile: dict = Depends(require_profile),
):
    """Same shape as /day/{day}, for today (the org's own local today, not
    the caller's device timezone) — lets the dashboard know whether to hide
    the clock-in button (already have a closed record for today) without
    the frontend needing to compute "today" itself."""
    org = OrganizationsRepository(user_client).get(profile["org_id"])
    tz = org_timezone(org)
    today = datetime.now(tz).date()
    range_start, range_end = local_day_bounds(today, tz)
    records = AttendanceRepository(user_client).list_for_user_range(
        current_user.id, range_start.isoformat(), range_end.isoformat()
    )
    approved_leave = LeaveRequestsRepository(user_client).list_approved_in_range(
        today.isoformat(), today.isoformat()
    )
    return day_detail_for_user(
        records, [leave for leave in approved_leave if leave["user_id"] == current_user.id], current_user.id, today, tz
    )
