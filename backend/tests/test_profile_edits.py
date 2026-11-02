import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient
from postgrest.exceptions import APIError
from pydantic import ValidationError

from app.core.security import CurrentUser, decode_current_user
from app.dependencies import get_user_client, require_profile
from app.routers import profile as profile_router
from app.schemas.profile import ProfileEditCreate
from app.services import profile_service
from app.services.profile_service import can_resolve, with_derived_fields

ORG = "org-1"


def user(uid, role, name=None, email=None):
    return {"id": uid, "org_id": ORG, "role": role, "name": name or uid, "email": email or f"{uid}@example.com"}


# ---- schema -------------------------------------------------------------------------


def test_create_trims_and_lowercases():
    payload = ProfileEditCreate(name="  Ana Cruz ", email=" Ana@Example.COM ", reason=" new surname ")
    assert (payload.name, payload.email, payload.reason) == ("Ana Cruz", "ana@example.com", "new surname")


@pytest.mark.parametrize(
    "fields",
    [
        {"reason": "x"},  # nothing requested
        {"name": "   ", "reason": "x"},
        {"email": "not-an-email", "reason": "x"},
        {"email": "a b@example.com", "reason": "x"},
        {"name": "Ana", "reason": "   "},
        {"name": "x" * 101, "reason": "x"},
    ],
)
def test_create_rejects_invalid(fields):
    with pytest.raises(ValidationError):
        ProfileEditCreate(**fields)


# ---- pure rules ---------------------------------------------------------------------------


def test_can_resolve_rules():
    assert can_resolve("admin-1", "staff-1", admin_level_count=2)
    assert not can_resolve("admin-1", "admin-1", admin_level_count=2)
    assert can_resolve("admin-1", "admin-1", admin_level_count=1)  # sole admin-level member


@pytest.mark.parametrize(
    "status, new_value, current_email, expected",
    [
        ("approved", {"email": "new@example.com"}, "old@example.com", True),
        ("approved", {"email": "new@example.com"}, "new@example.com", False),  # confirmed
        ("pending", {"email": "new@example.com"}, "old@example.com", False),
        ("approved", {"name": "Ana"}, "old@example.com", False),
    ],
)
def test_awaiting_email_confirmation(status, new_value, current_email, expected):
    row = {"status": status, "new_value": new_value, "user_current_email": current_email}
    assert with_derived_fields(row)["awaiting_email_confirmation"] is expected
    assert "user_current_email" not in row


# ---- routes, with faked data access ----------------------------------------------------------


class Fakes:
    def __init__(self):
        self.plan = "free"
        self.members = [user("super-1", "super_admin"), user("admin-1", "admin"), user("staff-1", "staff")]
        self.requests = {}
        self.names_applied = []
        self.email_changes = []
        self.rls_refuses_resolve = False


@pytest.fixture
def env(monkeypatch):
    fakes = Fakes()

    class Orgs:
        def __init__(self, client): pass
        def get(self, org_id): return {"id": org_id, "plan": fakes.plan}

    class Users:
        def __init__(self, client): pass
        def list_for_org(self): return fakes.members
        def update_name(self, user_id, name): fakes.names_applied.append((user_id, name))

    class Requests:
        def __init__(self, client): pass
        def create(self, org_id, user_id, reason, old_value, new_value):
            if any(r["user_id"] == user_id and r["status"] == "pending" for r in fakes.requests.values()):
                raise APIError({"code": "23505", "message": "duplicate"})
            rid = f"req-{len(fakes.requests) + 1}"
            fakes.requests[rid] = {
                "id": rid, "org_id": org_id, "user_id": user_id, "requested_by": user_id, "approved_by": None,
                "reason": reason, "old_value": old_value, "new_value": new_value, "status": "pending",
                "created_at": "2026-11-02T00:00:00Z", "resolved_at": None,
            }
            return self.get(rid)
        def get(self, rid):
            row = fakes.requests.get(rid)
            if row is None:
                return None
            subject = next(m for m in fakes.members if m["id"] == row["user_id"])
            return {**row, "user_name": subject["name"], "user_current_email": subject["email"]}
        def list_all(self): return [self.get(rid) for rid in fakes.requests]
        def mark_resolved(self, rid, approved_by, status):
            if fakes.rls_refuses_resolve:
                return None
            fakes.requests[rid].update(status=status, approved_by=approved_by, resolved_at="2026-11-02T01:00:00Z")
            return self.get(rid)

    class Auth:
        def __init__(self, url, key): pass
        def request_email_change(self, token, email, redirect_to): fakes.email_changes.append((token, email, redirect_to))

    monkeypatch.setattr(profile_service, "OrganizationsRepository", Orgs)
    monkeypatch.setattr(profile_service, "UsersRepository", Users)
    monkeypatch.setattr(profile_service, "ProfileEditRequestsRepository", Requests)
    monkeypatch.setattr(profile_router, "AuthIdentityRepository", Auth)
    monkeypatch.setattr(profile_router, "get_service_role_client", lambda: object())

    app = FastAPI()
    app.include_router(profile_router.router)
    app.dependency_overrides[get_user_client] = lambda: object()

    def as_user(uid):
        me = next(m for m in fakes.members if m["id"] == uid)
        app.dependency_overrides[require_profile] = lambda: me
        app.dependency_overrides[decode_current_user] = lambda: CurrentUser(id=uid, email=me["email"], access_token=f"token-{uid}")
        return TestClient(app)

    return fakes, as_user


def submit(client, **body):
    return client.post("/profile-edits", json={"reason": "Changed my name", **body})


def test_request_only_records_changed_fields(env):
    fakes, as_user = env
    response = submit(as_user("staff-1"), name="Staff One", email="staff-1@example.com")
    assert response.status_code == 201
    body = response.json()
    assert body["new_value"] == {"name": "Staff One"} and body["old_value"] == {"name": "staff-1"}
    assert body["status"] == "pending"


def test_request_with_no_real_change_is_422(env):
    _, as_user = env
    assert submit(as_user("staff-1"), name="staff-1").status_code == 422


def test_one_pending_request_per_user(env):
    _, as_user = env
    client = as_user("staff-1")
    assert submit(client, name="A").status_code == 201
    assert submit(client, name="B").status_code == 409


def test_demo_org_blocked(env):
    fakes, as_user = env
    fakes.plan = "demo"
    assert submit(as_user("super-1"), email="mine@example.com").status_code == 403


def test_staff_cannot_resolve(env):
    _, as_user = env
    rid = submit(as_user("staff-1"), name="A").json()["id"]
    assert as_user("staff-1").patch(f"/profile-edits/{rid}/approve").status_code == 403


def test_admin_approves_name_and_it_is_applied(env):
    fakes, as_user = env
    rid = submit(as_user("staff-1"), name="Staff One").json()["id"]
    response = as_user("admin-1").patch(f"/profile-edits/{rid}/approve")
    assert response.status_code == 200
    assert response.json()["status"] == "approved" and response.json()["approved_by"] == "admin-1"
    assert fakes.names_applied == [("staff-1", "Staff One")]
    assert as_user("admin-1").patch(f"/profile-edits/{rid}/approve").status_code == 409


def test_reject_applies_nothing(env):
    fakes, as_user = env
    rid = submit(as_user("staff-1"), name="Staff One").json()["id"]
    assert as_user("super-1").patch(f"/profile-edits/{rid}/reject").json()["status"] == "rejected"
    assert fakes.names_applied == []


def test_no_self_approval_when_another_admin_exists(env):
    fakes, as_user = env
    rid = submit(as_user("admin-1"), name="Admin One").json()["id"]
    assert as_user("admin-1").patch(f"/profile-edits/{rid}/approve").status_code == 403
    assert fakes.names_applied == []
    assert as_user("super-1").patch(f"/profile-edits/{rid}/approve").status_code == 200


def test_sole_admin_level_member_may_self_approve(env):
    fakes, as_user = env
    fakes.members = [user("super-1", "super_admin"), user("staff-1", "staff")]
    rid = submit(as_user("super-1"), name="Founder").json()["id"]
    assert as_user("super-1").patch(f"/profile-edits/{rid}/approve").status_code == 200
    assert fakes.names_applied == [("super-1", "Founder")]


def test_rls_refusal_applies_nothing(env):
    fakes, as_user = env
    rid = submit(as_user("staff-1"), name="Staff One").json()["id"]
    fakes.rls_refuses_resolve = True
    assert as_user("admin-1").patch(f"/profile-edits/{rid}/approve").status_code == 403
    assert fakes.names_applied == []


def test_email_change_needs_approval_then_user_confirmation(env):
    fakes, as_user = env
    staff = as_user("staff-1")
    rid = submit(staff, email="new@example.com").json()["id"]
    assert staff.post(f"/profile-edits/{rid}/send-email-confirmation").status_code == 409  # still pending
    approved = as_user("admin-1").patch(f"/profile-edits/{rid}/approve").json()
    assert approved["awaiting_email_confirmation"] is True
    assert fakes.names_applied == []  # approving an email changes nothing by itself
    staff = as_user("staff-1")
    response = staff.post(f"/profile-edits/{rid}/send-email-confirmation")
    assert response.status_code == 200
    token, email, redirect_to = fakes.email_changes[0]
    assert (token, email) == ("token-staff-1", "new@example.com") and redirect_to.endswith("/profile")


def test_only_the_requester_can_send_their_confirmation(env):
    fakes, as_user = env
    rid = submit(as_user("staff-1"), email="new@example.com").json()["id"]
    as_user("admin-1").patch(f"/profile-edits/{rid}/approve")
    assert as_user("admin-1").post(f"/profile-edits/{rid}/send-email-confirmation").status_code == 404
    assert fakes.email_changes == []
