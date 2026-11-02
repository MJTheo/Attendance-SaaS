import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.dependencies import get_user_client, require_profile
from app.routers import admin

ORG_ID = "00000000-0000-0000-0000-000000000001"


def _profile(role: str) -> dict:
    return {"id": f"user-{role}", "org_id": ORG_ID, "role": role, "name": role, "email": f"{role}@example.com"}


class FakeOrganizationsRepository:
    renamed_to: list[str] = []
    plan = "free"

    def __init__(self, client):
        pass

    def get(self, org_id: str) -> dict:
        return {
            "id": org_id,
            "name": "Acme",
            "plan": type(self).plan,
            "created_at": "2026-08-05T09:00:00+00:00",
            "working_days": [0, 1, 2, 3, 4],
            "timezone": "Asia/Manila",
        }

    def rename(self, org_id: str, name: str) -> dict:
        type(self).renamed_to.append(name)
        return {**self.get(org_id), "name": name}


class FakeUsersRepository:
    def __init__(self, client):
        pass

    def list_for_org(self, org_id=None) -> list[dict]:
        return [_profile("staff"), _profile("staff"), _profile("super_admin")]


@pytest.fixture
def client_as(monkeypatch):
    monkeypatch.setattr(admin, "OrganizationsRepository", FakeOrganizationsRepository)
    monkeypatch.setattr(admin, "UsersRepository", FakeUsersRepository)
    FakeOrganizationsRepository.renamed_to = []
    FakeOrganizationsRepository.plan = "free"

    # Bare app with just the admin router — main.app would start the
    # APScheduler jobs via its lifespan.
    app = FastAPI()
    app.include_router(admin.router)
    app.dependency_overrides[get_user_client] = lambda: object()

    def make(role: str) -> TestClient:
        app.dependency_overrides[require_profile] = lambda: _profile(role)
        return TestClient(app)

    return make


@pytest.mark.parametrize("role", ["admin", "super_admin"])
def test_get_organization_for_admins(client_as, role):
    response = client_as(role).get("/admin/organization")
    assert response.status_code == 200
    body = response.json()
    assert body["name"] == "Acme"
    assert body["plan"] == "free"
    assert body["member_counts"] == {"staff": 2, "admin": 0, "super_admin": 1}


def test_get_organization_forbidden_for_staff(client_as):
    assert client_as("staff").get("/admin/organization").status_code == 403


@pytest.mark.parametrize("role", ["staff", "admin"])
def test_rename_forbidden_below_super_admin(client_as, role):
    response = client_as(role).patch("/admin/organization", json={"name": "New name"})
    assert response.status_code == 403
    assert FakeOrganizationsRepository.renamed_to == []


def test_rename_as_super_admin_trims_name(client_as):
    response = client_as("super_admin").patch("/admin/organization", json={"name": "  New name  "})
    assert response.status_code == 200
    assert response.json()["name"] == "New name"
    assert FakeOrganizationsRepository.renamed_to == ["New name"]


def test_rename_blocked_for_demo_org(client_as):
    FakeOrganizationsRepository.plan = "demo"
    response = client_as("super_admin").patch("/admin/organization", json={"name": "Hijacked"})
    assert response.status_code == 403
    assert FakeOrganizationsRepository.renamed_to == []


def test_rename_rejects_blank_name(client_as):
    response = client_as("super_admin").patch("/admin/organization", json={"name": "   "})
    assert response.status_code == 422
    assert FakeOrganizationsRepository.renamed_to == []
