from fastapi import APIRouter, Depends
from supabase import Client

from app.dependencies import get_user_client, require_admin
from app.repositories.attendance import AttendanceRepository
from app.schemas.attendance import TeamAttendanceRecord

router = APIRouter(prefix="/admin", tags=["admin"])


@router.get("/attendance", response_model=list[TeamAttendanceRecord])
def team_attendance(
    user_client: Client = Depends(get_user_client),
    admin: dict = Depends(require_admin),
    limit: int = 200,
):
    return AttendanceRepository(user_client).list_for_org(limit)
