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
