from supabase import Client


class ReportsRepository:
    def __init__(self, client: Client):
        self._client = client

    def create(self, org_id: str, report_type: str, payload: dict) -> dict:
        response = (
            self._client.table("reports")
            .insert({"org_id": org_id, "type": report_type, "payload": payload})
            .execute()
        )
        return response.data[0]

    def list_for_org(self, limit: int = 50) -> list[dict]:
        # RLS ("admins can view reports in their org") scopes this to the
        # caller's org automatically — same pattern as AttendanceRepository.list_for_org.
        response = (
            self._client.table("reports")
            .select("*")
            .order("generated_at", desc=True)
            .limit(limit)
            .execute()
        )
        return response.data
