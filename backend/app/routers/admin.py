from fastapi import APIRouter, Depends, HTTPException, status
from supabase import Client

from app.config import get_settings
from app.dependencies import get_service_role_client, get_user_client, require_admin
from app.repositories.attendance import AttendanceRepository
from app.repositories.organizations import OrganizationsRepository
from app.repositories.reports import ReportsRepository
from app.schemas.analytics import Report, TeamAnalytics
from app.schemas.attendance import TeamAttendanceRecord
from app.schemas.auth import InviteRequest, UserProfile
from app.schemas.organization import OrgSettings, UpdateOrgSettings
from app.services.analytics_service import late_rate_by_weekday, summarize_users
from app.services.invites_service import (
    DemoOrgInviteBlockedError,
    InviteEmailInUseError,
    InviteFailedError,
    InviteRateLimitedError,
    InvitesService,
)

router = APIRouter(prefix="/admin", tags=["admin"])


@router.get("/attendance", response_model=list[TeamAttendanceRecord])
def team_attendance(
    user_client: Client = Depends(get_user_client),
    admin: dict = Depends(require_admin),
    limit: int = 200,
):
    return AttendanceRepository(user_client).list_for_org(limit)


@router.get("/analytics", response_model=TeamAnalytics)
def team_analytics(
    user_client: Client = Depends(get_user_client),
    admin: dict = Depends(require_admin),
):
    org = OrganizationsRepository(user_client).get(admin["org_id"])
    records = AttendanceRepository(user_client).list_for_org(2000)
    return {"users": summarize_users(records), "by_weekday": late_rate_by_weekday(records, org["working_days"])}


@router.get("/settings", response_model=OrgSettings)
def get_org_settings(
    user_client: Client = Depends(get_user_client),
    admin: dict = Depends(require_admin),
):
    return OrganizationsRepository(user_client).get(admin["org_id"])


@router.patch("/settings", response_model=OrgSettings)
def update_org_settings(
    payload: UpdateOrgSettings,
    user_client: Client = Depends(get_user_client),
    admin: dict = Depends(require_admin),
):
    return OrganizationsRepository(user_client).update_working_days(admin["org_id"], payload.working_days)


@router.get("/reports", response_model=list[Report])
def list_reports(
    user_client: Client = Depends(get_user_client),
    admin: dict = Depends(require_admin),
):
    return ReportsRepository(user_client).list_for_org()


@router.post("/invite", response_model=UserProfile, status_code=status.HTTP_201_CREATED)
def invite_staff(
    payload: InviteRequest,
    user_client: Client = Depends(get_user_client),
    admin: dict = Depends(require_admin),
):
    settings = get_settings()
    service = InvitesService(user_client, get_service_role_client())
    try:
        return service.invite_staff(
            admin["org_id"], payload.email, payload.name, f"{settings.frontend_url}/accept-invite"
        )
    except InviteEmailInUseError as exc:
        raise HTTPException(status.HTTP_409_CONFLICT, "That email is already registered") from exc
    except InviteRateLimitedError as exc:
        raise HTTPException(
            status.HTTP_429_TOO_MANY_REQUESTS, "Too many invite emails sent recently — try again shortly"
        ) from exc
    except InviteFailedError as exc:
        raise HTTPException(status.HTTP_500_INTERNAL_SERVER_ERROR, "Failed to create staff profile") from exc
    except DemoOrgInviteBlockedError as exc:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Invites are disabled for the demo organization") from exc
