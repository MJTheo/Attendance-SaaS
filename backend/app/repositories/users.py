from supabase import Client


class UsersRepository:
    def __init__(self, client: Client):
        self._client = client

    def get_profile(self, user_id: str) -> dict | None:
        # .maybe_single() returns bare None (not a response with .data=None) on
        # zero rows in some postgrest-py versions — .limit(1) sidesteps that.
        response = self._client.table("users").select("*").eq("id", user_id).limit(1).execute()
        rows = response.data
        return rows[0] if rows else None

    def create(self, user_id: str, org_id: str, role: str, name: str, email: str) -> dict:
        response = (
            self._client.table("users")
            .insert({"id": user_id, "org_id": org_id, "role": role, "name": name, "email": email})
            .execute()
        )
        return response.data[0]

    def list_for_org(self, org_id: str | None = None) -> list[dict]:
        # RLS ("members can view users in their org") scopes this to the
        # caller's org automatically for a user-scoped client — org_id is
        # only needed with the service-role client (e.g. the daily closeout
        # job, which iterates every org).
        query = self._client.table("users").select("*")
        if org_id is not None:
            query = query.eq("org_id", org_id)
        response = query.order("name").execute()
        return response.data
