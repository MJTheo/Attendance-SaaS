from datetime import datetime, timedelta, timezone

from supabase import Client

from app.repositories.attendance import AttendanceRepository
from app.repositories.corrections import CorrectionsRepository
from app.repositories.leave_requests import LeaveRequestsRepository
from app.repositories.profile_edit_requests import ProfileEditRequestsRepository
from app.repositories.users import UsersRepository
from app.services.profile_service import ADMIN_LEVEL_ROLES, can_resolve

# Derived on read, not a stored notification log (see ROADMAP "Notifications"):
# everything here is already queryable, so there's no read/unread state to keep.
MISSED_CLOCKOUT_WINDOW_DAYS = 30


def pending_items(
    profile: dict,
    leave_requests: list[dict],
    corrections: list[dict],
    profile_edits: list[dict],
    members: list[dict],
    own_records: list[dict],
) -> dict:
    """Everything waiting on this person, oldest first: the Inbox page lists
    these, and the counts below are their lengths, so the badge and the page
    always agree."""
    is_admin = profile["role"] in ADMIN_LEVEL_ROLES
    if is_admin:
        admin_level_count = sum(1 for member in members if member["role"] in ADMIN_LEVEL_ROLES)
        leave = [request for request in leave_requests if request["status"] == "pending"]
        pending_corrections = [correction for correction in corrections if correction["status"] == "pending"]
        # Only the profile changes this admin may actually resolve.
        profile_changes = [
            request
            for request in profile_edits
            if request["status"] == "pending" and can_resolve(profile["id"], request["requested_by"], admin_level_count)
        ]
    else:
        leave, pending_corrections, profile_changes = [], [], []

    corrected = {
        correction["attendance_record_id"]
        for correction in corrections
        if correction["status"] in ("pending", "approved")
    }
    missed_clockouts = [
        record
        for record in own_records
        if record["user_id"] == profile["id"] and record["status"] == "missed_clockout" and record["id"] not in corrected
    ]

    def oldest_first(rows: list[dict], key: str) -> list[dict]:
        return sorted(rows, key=lambda row: row.get(key) or "")

    return {
        "leave": oldest_first(leave, "created_at"),
        "corrections": oldest_first(pending_corrections, "created_at"),
        "profile_changes": oldest_first(profile_changes, "created_at"),
        "missed_clockouts": oldest_first(missed_clockouts, "clock_in"),
    }


def count_items(items: dict) -> dict:
    counts = {
        "leave_approvals": len(items["leave"]),
        "correction_approvals": len(items["corrections"]),
        "profile_changes": len(items["profile_changes"]),
        "missed_clockouts": len(items["missed_clockouts"]),
    }
    return {**counts, "total": sum(counts.values())}


def count_notifications(*args, **kwargs) -> dict:
    return count_items(pending_items(*args, **kwargs))


class NotificationsService:
    def __init__(self, user_client: Client):
        self._client = user_client

    def for_user(self, profile: dict) -> dict:
        return count_items(self.inbox(profile))

    def inbox(self, profile: dict) -> dict:
        is_admin = profile["role"] in ADMIN_LEVEL_ROLES
        now = datetime.now(timezone.utc)
        own_records = AttendanceRepository(self._client).list_for_user_range(
            profile["id"],
            (now - timedelta(days=MISSED_CLOCKOUT_WINDOW_DAYS)).isoformat(),
            (now + timedelta(days=1)).isoformat(),
        )
        # RLS scopes these lists: the whole org for admins, your own rows for staff.
        return pending_items(
            profile,
            leave_requests=LeaveRequestsRepository(self._client).list_all() if is_admin else [],
            corrections=CorrectionsRepository(self._client).list_all(),
            profile_edits=ProfileEditRequestsRepository(self._client).list_all() if is_admin else [],
            members=UsersRepository(self._client).list_for_org() if is_admin else [],
            own_records=own_records,
        )
