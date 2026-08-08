from supabase import Client


class OrganizationsRepository:
    def __init__(self, client: Client):
        self._client = client

    def get(self, org_id: str) -> dict:
        response = (
            self._client.table("organizations")
            .select("id, name, plan, working_days")
            .eq("id", org_id)
            .limit(1)
            .execute()
        )
        return response.data[0]

    def update_working_days(self, org_id: str, working_days: int) -> dict:
        response = (
            self._client.table("organizations")
            .update({"working_days": working_days})
            .eq("id", org_id)
            .execute()
        )
        return response.data[0]
