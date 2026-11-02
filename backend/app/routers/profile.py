from fastapi import APIRouter, Depends, HTTPException, status
from supabase import Client

from app.config import get_settings
from app.core.security import CurrentUser, decode_current_user
from app.dependencies import get_service_role_client, get_user_client, require_admin, require_profile
from app.repositories.auth_identity import (
    AuthIdentityRepository,
    EmailChangeFailedError,
    EmailInUseError,
    EmailRateLimitedError,
)
from app.schemas.profile import ProfileEditCreate, ProfileEditRequest
from app.services.profile_service import (
    DemoOrgProfileEditBlockedError,
    NoEmailChangeToConfirmError,
    NothingToChangeError,
    PendingRequestExistsError,
    ProfileEditAlreadyResolvedError,
    ProfileEditNotFoundError,
    ProfileService,
    SelfApprovalError,
)

router = APIRouter(prefix="/profile-edits", tags=["profile"])


@router.post("", response_model=ProfileEditRequest, status_code=status.HTTP_201_CREATED)
def request_profile_edit(
    payload: ProfileEditCreate,
    user_client: Client = Depends(get_user_client),
    profile: dict = Depends(require_profile),
):
    service = ProfileService(user_client, get_service_role_client())
    try:
        return service.request_edit(profile, payload)
    except DemoOrgProfileEditBlockedError as exc:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Profile edits are disabled for the demo organization") from exc
    except NothingToChangeError as exc:
        raise HTTPException(422, "That's already your current name and email") from exc
    except PendingRequestExistsError as exc:
        raise HTTPException(status.HTTP_409_CONFLICT, "You already have a profile change waiting for approval") from exc


@router.get("", response_model=list[ProfileEditRequest])
def list_profile_edits(
    user_client: Client = Depends(get_user_client),
    profile: dict = Depends(require_profile),
):
    # RLS-scoped: your own requests, or the whole org's for admins.
    return ProfileService(user_client, get_service_role_client()).list_requests()


def _resolve(request_id: str, resolver: dict, user_client: Client, approve: bool) -> dict:
    service = ProfileService(user_client, get_service_role_client())
    try:
        return service.resolve(request_id, resolver, approve)
    except ProfileEditNotFoundError as exc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Profile edit request not found") from exc
    except ProfileEditAlreadyResolvedError as exc:
        raise HTTPException(status.HTTP_409_CONFLICT, "Profile edit request already resolved") from exc
    except SelfApprovalError as exc:
        raise HTTPException(
            status.HTTP_403_FORBIDDEN, "Another admin has to review your own profile change"
        ) from exc


@router.patch("/{request_id}/approve", response_model=ProfileEditRequest)
def approve_profile_edit(
    request_id: str,
    user_client: Client = Depends(get_user_client),
    admin: dict = Depends(require_admin),
):
    return _resolve(request_id, admin, user_client, approve=True)


@router.patch("/{request_id}/reject", response_model=ProfileEditRequest)
def reject_profile_edit(
    request_id: str,
    user_client: Client = Depends(get_user_client),
    admin: dict = Depends(require_admin),
):
    return _resolve(request_id, admin, user_client, approve=False)


@router.post("/{request_id}/send-email-confirmation", response_model=ProfileEditRequest)
def send_email_confirmation(
    request_id: str,
    current_user: CurrentUser = Depends(decode_current_user),
    user_client: Client = Depends(get_user_client),
    profile: dict = Depends(require_profile),
):
    settings = get_settings()
    auth = AuthIdentityRepository(settings.supabase_url, settings.supabase_publishable_key)
    service = ProfileService(user_client, get_service_role_client())
    try:
        return service.send_email_confirmation(
            request_id, profile, current_user.access_token, auth, f"{settings.frontend_url}/profile"
        )
    except ProfileEditNotFoundError as exc:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "Profile edit request not found") from exc
    except NoEmailChangeToConfirmError as exc:
        raise HTTPException(status.HTTP_409_CONFLICT, "There's no approved email change waiting to be confirmed") from exc
    except EmailInUseError as exc:
        raise HTTPException(status.HTTP_409_CONFLICT, "That email is already used by another account") from exc
    except EmailRateLimitedError as exc:
        raise HTTPException(
            status.HTTP_429_TOO_MANY_REQUESTS, "Too many emails sent recently — try again shortly"
        ) from exc
    except EmailChangeFailedError as exc:
        raise HTTPException(status.HTTP_502_BAD_GATEWAY, "Couldn't send the confirmation email") from exc
