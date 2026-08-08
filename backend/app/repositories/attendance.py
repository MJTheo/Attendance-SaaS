from supabase import Client


class AttendanceRepository:
    def __init__(self, client: Client):
        self._client = client

    def get_open_record(self, user_id: str) -> dict | None:
        # See UsersRepository.get_profile for why .maybe_single() is avoided.
        #
        # status != 'absent' excludes the daily closeout job's auto-created
        # no-show records: those never had a real clock-in, so they always
        # carry clock_out = null by design — without this filter, anyone
        # ever auto-marked absent would look permanently "clocked in" and be
        # blocked from ever clocking in again.
        response = (
            self._client.table("attendance_records")
            .select("*")
            .eq("user_id", user_id)
            .is_("clock_out", "null")
            .neq("status", "absent")
            .order("clock_in", desc=True)
            .limit(1)
            .execute()
        )
        rows = response.data
        return rows[0] if rows else None

    def create_clock_in(self, org_id: str, user_id: str, clock_in_at: str, status: str) -> dict:
        response = (
            self._client.table("attendance_records")
            .insert(
                {
                    "org_id": org_id,
                    "user_id": user_id,
                    "clock_in": clock_in_at,
                    "status": status,
                }
            )
            .execute()
        )
        return response.data[0]

    def set_clock_out(self, record_id: str, clock_out_at: str, notes: str | None) -> dict:
        payload: dict = {"clock_out": clock_out_at}
        if notes is not None:
            payload["notes"] = notes
        response = (
            self._client.table("attendance_records").update(payload).eq("id", record_id).execute()
        )
        return response.data[0]

    def list_for_user(self, user_id: str, limit: int) -> list[dict]:
        response = (
            self._client.table("attendance_records")
            .select("*")
            .eq("user_id", user_id)
            .order("clock_in", desc=True)
            .limit(limit)
            .execute()
        )
        return response.data

    def get_by_id(self, record_id: str) -> dict | None:
        # Constructed with the user-scoped client, RLS silently returns zero
        # rows if this record isn't the caller's own — that's what stops a
        # staff member from snapshotting someone else's attendance record.
        response = self._client.table("attendance_records").select("*").eq("id", record_id).limit(1).execute()
        rows = response.data
        return rows[0] if rows else None

    def apply_correction(self, record_id: str, fields: dict) -> dict:
        # Only ever call this with the service-role client. RLS gives staff
        # no UPDATE path to attendance_records beyond their own clock-out, and
        # the clock-out guard trigger blocks arbitrary field changes even
        # then — this is the one place approved corrections get written.
        response = self._client.table("attendance_records").update(fields).eq("id", record_id).execute()
        return response.data[0]

    def list_for_org(self, limit: int) -> list[dict]:
        # RLS ("admins can view all attendance records in their org") scopes
        # this to the caller's org automatically — no explicit org_id filter
        # needed as long as this is called with the user-scoped client.
        response = (
            self._client.table("attendance_records")
            .select("*, users(name)")
            .order("clock_in", desc=True)
            .limit(limit)
            .execute()
        )
        return self._flatten_user_name(response.data)

    def list_for_org_range(self, start: str, end: str, limit: int = 5000, org_id: str | None = None) -> list[dict]:
        """clock_in in [start, end) — end is exclusive, pass a day boundary.
        Used by the calendar, the analytics trend chart, and the Team page's
        period-grouped attendance view, so it stays bounded instead of
        pulling the whole org's history like list_for_org does.

        org_id is only needed when called with the service-role client (RLS
        isn't there to scope it) — e.g. the daily closeout job, which iterates
        every org. User-scoped call sites can omit it."""
        query = (
            self._client.table("attendance_records")
            .select("*, users(name)")
            .gte("clock_in", start)
            .lt("clock_in", end)
        )
        if org_id is not None:
            query = query.eq("org_id", org_id)
        response = query.order("clock_in", desc=True).limit(limit).execute()
        return self._flatten_user_name(response.data)

    def list_for_user_range(self, user_id: str, start: str, end: str) -> list[dict]:
        response = (
            self._client.table("attendance_records")
            .select("*")
            .eq("user_id", user_id)
            .gte("clock_in", start)
            .lt("clock_in", end)
            .order("clock_in", desc=True)
            .execute()
        )
        return response.data

    @staticmethod
    def _flatten_user_name(rows: list[dict]) -> list[dict]:
        records = []
        for row in rows:
            user = row.pop("users", None) or {}
            records.append({**row, "user_name": user.get("name", "")})
        return records
