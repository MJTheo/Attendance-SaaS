from datetime import datetime, timezone

from supabase import Client


class CorrectionsRepository:
    def __init__(self, client: Client):
        self._client = client

    def create(
        self,
        org_id: str,
        attendance_record_id: str,
        requested_by: str,
        reason: str,
        old_value: dict,
        new_value: dict,
    ) -> dict:
        response = (
            self._client.table("corrections")
            .insert(
                {
                    "org_id": org_id,
                    "attendance_record_id": attendance_record_id,
                    "requested_by": requested_by,
                    "reason": reason,
                    "old_value": old_value,
                    "new_value": new_value,
                }
            )
            .execute()
        )
        return response.data[0]

    def list_all(self) -> list[dict]:
        # No role branching here: RLS already scopes this per caller — staff
        # see only their own requests, admins see every correction in their
        # org (see the two SELECT policies on `corrections`).
        # `users!requested_by` disambiguates the embed: corrections has two
        # FKs into users (requested_by, approved_by), so an unqualified
        # `users(name)` embed would be ambiguous.
        response = (
            self._client.table("corrections")
            .select("*, requester:users!requested_by(name)")
            .order("created_at", desc=True)
            .execute()
        )
        return self._flatten_requester_name(response.data)

    @staticmethod
    def _flatten_requester_name(rows: list[dict]) -> list[dict]:
        records = []
        for row in rows:
            requester = row.pop("requester", None) or {}
            records.append({**row, "requested_by_name": requester.get("name")})
        return records

    def get(self, correction_id: str) -> dict | None:
        response = self._client.table("corrections").select("*").eq("id", correction_id).limit(1).execute()
        rows = response.data
        return rows[0] if rows else None

    def mark_resolved(self, correction_id: str, approved_by: str, new_status: str) -> dict:
        response = (
            self._client.table("corrections")
            .update(
                {
                    "status": new_status,
                    "approved_by": approved_by,
                    "resolved_at": datetime.now(timezone.utc).isoformat(),
                }
            )
            .eq("id", correction_id)
            .execute()
        )
        return response.data[0]
