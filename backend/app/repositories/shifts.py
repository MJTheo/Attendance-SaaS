from datetime import datetime, timezone

from supabase import Client


class ShiftsRepository:
    """Shift templates and per-person assignments. RLS scopes every query to
    the caller's org (members read templates and their own assignment;
    admins manage both). Times are Postgres `time` values ("HH:MM:SS")."""

    def __init__(self, client: Client):
        self._client = client

    # ---- templates ----

    def list_templates(self) -> list[dict]:
        return self._client.table("shift_templates").select("*").order("start_time").order("name").execute().data

    def get_template(self, template_id: str) -> dict | None:
        rows = self._client.table("shift_templates").select("*").eq("id", template_id).limit(1).execute().data
        return rows[0] if rows else None

    def create_template(self, org_id: str, name: str, start: str, end: str) -> dict:
        row = {"org_id": org_id, "name": name, "start_time": start, "end_time": end}
        return self._client.table("shift_templates").insert(row).execute().data[0]

    def update_template(self, template_id: str, fields: dict) -> dict | None:
        rows = self._client.table("shift_templates").update(fields).eq("id", template_id).execute().data
        return rows[0] if rows else None

    def delete_template(self, template_id: str) -> None:
        self._client.table("shift_templates").delete().eq("id", template_id).execute()

    # ---- assignments ----

    def list_assignments(self, org_id: str | None = None) -> list[dict]:
        # org_id only for the service-role client (the closeout job).
        query = self._client.table("shift_assignments").select("*, template:shift_templates(name, start_time, end_time)")
        if org_id is not None:
            query = query.eq("org_id", org_id)
        return query.execute().data

    def get_assignment(self, user_id: str) -> dict | None:
        rows = (
            self._client.table("shift_assignments")
            .select("*, template:shift_templates(name, start_time, end_time)")
            .eq("user_id", user_id)
            .limit(1)
            .execute()
            .data
        )
        return rows[0] if rows else None

    def set_assignment(self, org_id: str, user_id: str, updated_by: str, template_id: str | None,
                       custom_start: str | None, custom_end: str | None) -> dict:
        row = {
            "org_id": org_id,
            "user_id": user_id,
            "template_id": template_id,
            "custom_start": custom_start,
            "custom_end": custom_end,
            "updated_by": updated_by,
            "updated_at": datetime.now(timezone.utc).isoformat(),
        }
        return self._client.table("shift_assignments").upsert(row, on_conflict="user_id").execute().data[0]

    def clear_assignment(self, user_id: str) -> None:
        self._client.table("shift_assignments").delete().eq("user_id", user_id).execute()
