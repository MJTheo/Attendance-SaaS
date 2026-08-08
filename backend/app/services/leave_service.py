from supabase import Client

from app.repositories.leave_requests import LeaveRequestsRepository
from app.schemas.leave import LeaveRequestCreate


class LeaveNotFoundError(Exception):
    pass


class LeaveAlreadyResolvedError(Exception):
    pass


class LeaveService:
    def __init__(self, user_client: Client):
        self._leave = LeaveRequestsRepository(user_client)

    def request_leave(self, org_id: str, user_id: str, payload: LeaveRequestCreate) -> dict:
        return self._leave.create(
            org_id,
            user_id,
            payload.leave_type,
            payload.start_date.isoformat(),
            payload.end_date.isoformat(),
            payload.reason,
        )

    def list_leave_requests(self) -> list[dict]:
        return self._leave.list_all()

    def resolve(self, leave_id: str, admin_id: str, approve: bool) -> dict:
        leave = self._leave.get(leave_id)
        if leave is None:
            raise LeaveNotFoundError()
        if leave["status"] != "pending":
            raise LeaveAlreadyResolvedError()
        return self._leave.mark_resolved(leave_id, admin_id, "approved" if approve else "rejected")
