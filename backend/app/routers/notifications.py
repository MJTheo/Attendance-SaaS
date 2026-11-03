from fastapi import APIRouter, Depends
from supabase import Client

from app.dependencies import get_user_client, require_profile
from app.schemas.notifications import Notifications
from app.services.notifications_service import NotificationsService

router = APIRouter(prefix="/notifications", tags=["notifications"])


@router.get("", response_model=Notifications)
def get_notifications(
    user_client: Client = Depends(get_user_client),
    profile: dict = Depends(require_profile),
):
    return NotificationsService(user_client).for_user(profile)
