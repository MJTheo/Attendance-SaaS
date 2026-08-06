from fastapi import APIRouter, Depends, HTTPException, status

from app.core.security import CurrentUser, decode_current_user
from app.dependencies import get_service_role_client, require_profile
from app.repositories.users import UsersRepository
from app.schemas.auth import SignupRequest, UserProfile
from app.services.auth_service import (
    AuthService,
    MissingEmailClaimError,
    OrgAlreadyProvisionedError,
)

router = APIRouter(prefix="/auth", tags=["auth"])


@router.post("/signup", response_model=UserProfile, status_code=status.HTTP_201_CREATED)
def signup(payload: SignupRequest, current_user: CurrentUser = Depends(decode_current_user)):
    """Provisions a new org + first admin for an already-authenticated Supabase
    identity. The frontend must call supabase.auth.signUp() first to create
    the auth identity and obtain the access token sent here."""
    service_client = get_service_role_client()
    auth_service = AuthService(service_client)
    try:
        auth_service.signup_organization(
            user_id=current_user.id,
            email=current_user.email,
            org_name=payload.org_name,
            admin_name=payload.admin_name,
        )
    except MissingEmailClaimError as exc:
        raise HTTPException(status.HTTP_400_BAD_REQUEST, "Token has no email claim") from exc
    except OrgAlreadyProvisionedError as exc:
        raise HTTPException(
            status.HTTP_409_CONFLICT, "This account is already part of an organization"
        ) from exc

    profile = UsersRepository(service_client).get_profile(current_user.id)
    return profile


@router.get("/me", response_model=UserProfile)
def get_me(profile: dict = Depends(require_profile)):
    return profile
