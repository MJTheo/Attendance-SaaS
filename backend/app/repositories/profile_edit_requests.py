from datetime import datetime, timezone

from supabase import Client


class ProfileEditRequestsRepository:
    def __init__(self, client: Client):
        self._client = client

    def create(self, org_id: str, user_id: str, reason: str, old_value: dict, new_value: dict) -> dict:
        response = (
            self._client.table("profile_edit_requests")
            .insert(
                {
                    "org_id": org_id,
                    "user_id": user_id,
                    "requested_by": user_id,
                    "reason": reason,
                    "old_value": old_value,
                    "new_value": new_value,
                }
            )
            .execute()
        )
        return self.get(response.data[0]["id"])

    def list_all(self) -> list[dict]:
        # RLS scopes this per caller (own requests for staff, the whole org
        # for admins), same as CorrectionsRepository.list_all. `users!user_id`
        # disambiguates the embed — three FKs point into users.
        response = (
            self._client.table("profile_edit_requests")
            .select("*, subject:users!user_id(name, email)")
            .order("created_at", desc=True)
            .execute()
        )
        return [self._flatten(row) for row in response.data]

    def get(self, request_id: str) -> dict | None:
        response = (
            self._client.table("profile_edit_requests")
            .select("*, subject:users!user_id(name, email)")
            .eq("id", request_id)
            .limit(1)
            .execute()
        )
        return self._flatten(response.data[0]) if response.data else None

    def mark_resolved(self, request_id: str, approved_by: str, new_status: str) -> dict | None:
        response = (
            self._client.table("profile_edit_requests")
            .update(
                {
                    "status": new_status,
                    "approved_by": approved_by,
                    "resolved_at": datetime.now(timezone.utc).isoformat(),
                }
            )
            .eq("id", request_id)
            .execute()
        )
        # Zero rows means RLS refused it (e.g. self-approval) — the service
        # checks that first, so this is defense in depth.
        return self.get(request_id) if response.data else None

    @staticmethod
    def _flatten(row: dict) -> dict:
        subject = row.pop("subject", None) or {}
        return {**row, "user_name": subject.get("name"), "user_current_email": subject.get("email")}
