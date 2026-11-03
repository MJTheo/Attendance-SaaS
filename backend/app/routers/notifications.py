from fastapi import APIRouter, Depends
from supabase import Client

from app.dependencies import get_user_client, require_profile
from app.schemas.notifications import Inbox, Notifications
from app.services.notifications_service import NotificationsService

router = APIRouter(prefix="/notifications", tags=["notifications"])


@router.get("", response_model=Notifications)
def get_notifications(
    user_client: Client = Depends(get_user_client),
    profile: dict = Depends(require_profile),
):
    return NotificationsService(user_client).for_user(profile)


@router.get("/inbox", response_model=Inbox)
def get_inbox(
    user_client: Client = Depends(get_user_client),
    profile: dict = Depends(require_profile),
):
    return NotificationsService(user_client).inbox(profile)
