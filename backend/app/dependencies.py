from functools import lru_cache

from fastapi import Depends, HTTPException, status
from supabase import Client, create_client

from app.config import get_settings
from app.core.security import CurrentUser, decode_current_user
from app.repositories.users import UsersRepository


@lru_cache
def _service_role_client() -> Client:
    settings = get_settings()
    return create_client(settings.supabase_url, settings.supabase_secret_key)


def get_service_role_client() -> Client:
    """Bypasses RLS entirely.

    Reserved for exactly three call sites, per the signup/corrections/reports
    design: AuthService.signup_organization, applying an approved correction's
    new_value to attendance_records, and the APScheduler report job. Do not
    wire this into a normal request-handling path — use get_user_client.
    """
    return _service_role_client()


def get_user_client(current_user: CurrentUser = Depends(decode_current_user)) -> Client:
    """Per-request client authenticated as the caller.

    Constructed fresh per request (can't be cached — it's tied to one user's
    token). Built with the publishable key so Supabase's gateway accepts the
    request, then re-authenticated with the caller's own JWT so Postgres RLS
    evaluates auth.uid()/auth.role() as that user, not as anon.
    """
    settings = get_settings()
    client = create_client(settings.supabase_url, settings.supabase_publishable_key)
    client.postgrest.auth(current_user.access_token)
    return client


def require_profile(
    current_user: CurrentUser = Depends(decode_current_user),
    user_client: Client = Depends(get_user_client),
) -> dict:
    profile = UsersRepository(user_client).get_profile(current_user.id)
    if profile is None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "No profile yet — call /auth/signup first")
    return profile


def require_admin(profile: dict = Depends(require_profile)) -> dict:
    if profile["role"] != "admin":
        raise HTTPException(status.HTTP_403_FORBIDDEN, "Admin only")
    return profile
