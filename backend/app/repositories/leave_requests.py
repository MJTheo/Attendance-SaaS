from datetime import datetime, timezone

from supabase import Client


class LeaveRequestsRepository:
    def __init__(self, client: Client):
        self._client = client

    def create(
        self,
        org_id: str,
        user_id: str,
        leave_type: str,
        start_date: str,
        end_date: str,
        reason: str,
    ) -> dict:
        response = (
            self._client.table("leave_requests")
            .insert(
                {
                    "org_id": org_id,
                    "user_id": user_id,
                    "requested_by": user_id,
                    "leave_type": leave_type,
                    "start_date": start_date,
                    "end_date": end_date,
                    "reason": reason,
                }
            )
            .execute()
        )
        return response.data[0]

    def list_all(self) -> list[dict]:
        # No role branching here: RLS already scopes this per caller — staff
        # see only their own requests, admins see every request in their org
        # (same pattern as CorrectionsRepository.list_all).
        response = self._client.table("leave_requests").select("*").order("created_at", desc=True).execute()
        return response.data

    def get(self, leave_id: str) -> dict | None:
        response = self._client.table("leave_requests").select("*").eq("id", leave_id).limit(1).execute()
        rows = response.data
        return rows[0] if rows else None

    def mark_resolved(self, leave_id: str, approved_by: str, new_status: str) -> dict:
        response = (
            self._client.table("leave_requests")
            .update(
                {
                    "status": new_status,
                    "approved_by": approved_by,
                    "resolved_at": datetime.now(timezone.utc).isoformat(),
                }
            )
            .eq("id", leave_id)
            .execute()
        )
        return response.data[0]

    def list_approved_in_range(self, start: str, end: str, org_id: str | None = None) -> list[dict]:
        # Overlap test: a leave spans [start_date, end_date] and overlaps the
        # window [start, end] iff it starts on/before the window ends AND
        # ends on/after the window starts.
        #
        # org_id is only needed with the service-role client (no RLS to scope
        # it) — e.g. the daily closeout job.
        query = (
            self._client.table("leave_requests")
            .select("*")
            .eq("status", "approved")
            .lte("start_date", end)
            .gte("end_date", start)
        )
        if org_id is not None:
            query = query.eq("org_id", org_id)
        response = query.execute()
        return response.data
