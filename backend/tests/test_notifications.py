from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.dependencies import get_user_client, require_profile
from app.routers import auth as auth_router
from app.routers import notifications as notifications_router
from app.services import notifications_service
from app.services.notifications_service import count_notifications


def person(uid, role):
    return {"id": uid, "org_id": "org-1", "role": role, "name": uid, "email": f"{uid}@example.com"}


ADMIN, OTHER_ADMIN, STAFF = person("admin-1", "admin"), person("super-1", "super_admin"), person("staff-1", "staff")
LEAVE = [{"status": "pending"}, {"status": "pending"}, {"status": "approved"}]
CORRECTIONS = [
    {"status": "pending", "attendance_record_id": "rec-a"},
    {"status": "rejected", "attendance_record_id": "rec-b"},
]
PROFILE_EDITS = [
    {"status": "pending", "requested_by": "staff-1"},
    {"status": "pending", "requested_by": "admin-1"},  # admin's own: not theirs to resolve
    {"status": "approved", "requested_by": "staff-1"},
]


def record(rid, status, user="staff-1"):
    return {"id": rid, "status": status, "user_id": user}


def test_admin_counts_pending_queues_and_skips_own_profile_change():
    counts = count_notifications(ADMIN, LEAVE, CORRECTIONS, PROFILE_EDITS, [ADMIN, OTHER_ADMIN, STAFF], [])
    assert counts == {"leave_approvals": 2, "correction_approvals": 1, "profile_changes": 1,
                      "missed_clockouts": 0, "total": 4}


def test_sole_admin_counts_own_profile_change():
    counts = count_notifications(ADMIN, [], [], PROFILE_EDITS, [ADMIN, STAFF], [])
    assert counts["profile_changes"] == 2


def test_staff_get_no_approval_counts():
    counts = count_notifications(STAFF, LEAVE, CORRECTIONS, PROFILE_EDITS, [], [])
    assert (counts["leave_approvals"], counts["correction_approvals"], counts["profile_changes"]) == (0, 0, 0)


def test_missed_clockouts_without_an_open_or_approved_correction():
    records = [
        record("rec-a", "missed_clockout"),  # has a pending correction → handled
        record("rec-b", "missed_clockout"),  # its correction was rejected → still needs one
        record("rec-c", "missed_clockout"),  # nothing filed
        record("rec-d", "present"),
        record("rec-e", "missed_clockout", user="someone-else"),
    ]
    counts = count_notifications(STAFF, [], CORRECTIONS, [], [], records)
    assert counts["missed_clockouts"] == 2 and counts["total"] == 2


def test_notifications_route_scopes_by_role(monkeypatch):
    class Repo:
        def __init__(self, client): pass
        def list_all(self): return LEAVE
        def list_for_org(self): return [ADMIN, OTHER_ADMIN, STAFF]
        def list_for_user_range(self, user_id, start, end): return [record("rec-c", "missed_clockout", user=user_id)]

    class Corrections(Repo):
        def list_all(self): return CORRECTIONS

    class ProfileEdits(Repo):
        def list_all(self): return PROFILE_EDITS

    for name, cls in [("LeaveRequestsRepository", Repo), ("UsersRepository", Repo), ("AttendanceRepository", Repo),
                      ("CorrectionsRepository", Corrections), ("ProfileEditRequestsRepository", ProfileEdits)]:
        monkeypatch.setattr(notifications_service, name, cls)
    app = FastAPI()
    app.include_router(notifications_router.router)
    app.dependency_overrides[get_user_client] = lambda: object()

    app.dependency_overrides[require_profile] = lambda: ADMIN
    assert TestClient(app).get("/notifications").json() == {
        "leave_approvals": 2, "correction_approvals": 1, "profile_changes": 1, "missed_clockouts": 1, "total": 5}
    app.dependency_overrides[require_profile] = lambda: STAFF
    assert TestClient(app).get("/notifications").json()["total"] == 1


def test_me_includes_org_name_plan_and_timezone(monkeypatch):
    class Orgs:
        def __init__(self, client): pass
        def get(self, org_id): return {"id": org_id, "name": "Demo Company", "plan": "demo", "timezone": "Asia/Manila"}

    monkeypatch.setattr(auth_router, "OrganizationsRepository", Orgs)
    app = FastAPI()
    app.include_router(auth_router.router)
    app.dependency_overrides[get_user_client] = lambda: object()
    app.dependency_overrides[require_profile] = lambda: STAFF
    body = TestClient(app).get("/auth/me").json()
    assert body["name"] == "staff-1" and body["role"] == "staff"
    assert (body["org_name"], body["org_plan"], body["org_timezone"]) == ("Demo Company", "demo", "Asia/Manila")
