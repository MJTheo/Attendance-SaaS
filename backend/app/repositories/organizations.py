from supabase import Client

# working_days is stored as a bitmask (bit i = weekday i is a working day,
# Monday=0..Sunday=6, matching Python's date.weekday()) so an org can express
# an arbitrary set of days — e.g. Tue-Sat — not just "the first N weekdays
# starting Monday". Every caller works with a plain set/list of weekday
# indices; the mask only exists at the storage boundary, here.


def mask_to_days(mask: int) -> list[int]:
    return [i for i in range(7) if mask & (1 << i)]


def days_to_mask(days: list[int]) -> int:
    mask = 0
    for day in days:
        mask |= 1 << day
    return mask


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
        row = response.data[0]
        return {**row, "working_days": mask_to_days(row["working_days"])}

    def update_working_days(self, org_id: str, working_days: list[int]) -> dict:
        response = (
            self._client.table("organizations")
            .update({"working_days": days_to_mask(working_days)})
            .eq("id", org_id)
            .execute()
        )
        row = response.data[0]
        return {**row, "working_days": mask_to_days(row["working_days"])}
