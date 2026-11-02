from postgrest.exceptions import APIError
from supabase import Client

from app.repositories.auth_identity import AuthIdentityRepository
from app.repositories.organizations import OrganizationsRepository
from app.repositories.profile_edit_requests import ProfileEditRequestsRepository
from app.repositories.users import UsersRepository
from app.schemas.profile import ProfileEditCreate

ADMIN_LEVEL_ROLES = ("admin", "super_admin")


class DemoOrgProfileEditBlockedError(Exception):
    pass


class NothingToChangeError(Exception):
    pass


class PendingRequestExistsError(Exception):
    pass


class ProfileEditNotFoundError(Exception):
    pass


class ProfileEditAlreadyResolvedError(Exception):
    pass


class SelfApprovalError(Exception):
    pass


class NoEmailChangeToConfirmError(Exception):
    pass


def can_resolve(resolver_id: str, requester_id: str, admin_level_count: int) -> bool:
    """Nobody resolves their own request — unless they're the org's only
    admin-level member, who would otherwise be stuck. Mirrors the
    app.can_resolve_profile_edit RLS check."""
    return resolver_id != requester_id or admin_level_count == 1


def with_derived_fields(request: dict) -> dict:
    current_email = request.pop("user_current_email", None)
    new_email = request["new_value"].get("email")
    request["awaiting_email_confirmation"] = (
        request["status"] == "approved" and new_email is not None and new_email != current_email
    )
    return request


class ProfileService:
    def __init__(self, user_client: Client, service_client: Client):
        self._requests = ProfileEditRequestsRepository(user_client)
        self._orgs = OrganizationsRepository(user_client)
        self._users = UsersRepository(user_client)
        self._service_users = UsersRepository(service_client)

    def request_edit(self, profile: dict, payload: ProfileEditCreate) -> dict:
        # The demo org's admin login is public — an email change there would
        # hand the shared login to whoever requested it.
        if self._orgs.get(profile["org_id"])["plan"] == "demo":
            raise DemoOrgProfileEditBlockedError()

        requested = {"name": payload.name, "email": payload.email}
        new_value = {field: value for field, value in requested.items() if value is not None and value != profile[field]}
        if not new_value:
            raise NothingToChangeError()
        old_value = {field: profile[field] for field in new_value}

        try:
            created = self._requests.create(profile["org_id"], profile["id"], payload.reason, old_value, new_value)
        except APIError as exc:
            if exc.code == "23505":  # profile_edit_requests_one_pending_per_user
                raise PendingRequestExistsError() from exc
            raise
        return with_derived_fields(created)

    def list_requests(self) -> list[dict]:
        return [with_derived_fields(request) for request in self._requests.list_all()]

    def resolve(self, request_id: str, resolver: dict, approve: bool) -> dict:
        request = self._requests.get(request_id)
        if request is None:
            raise ProfileEditNotFoundError()
        if request["status"] != "pending":
            raise ProfileEditAlreadyResolvedError()
        admin_level_count = sum(1 for user in self._users.list_for_org() if user["role"] in ADMIN_LEVEL_ROLES)
        if not can_resolve(resolver["id"], request["requested_by"], admin_level_count):
            raise SelfApprovalError()

        # Resolve first (through RLS, which re-checks the self-approval rule),
        # and only then apply — so a refused resolve can't leave a changed name.
        resolved = self._requests.mark_resolved(request_id, resolver["id"], "approved" if approve else "rejected")
        if resolved is None:
            raise SelfApprovalError()
        if approve and "name" in request["new_value"]:
            self._service_users.update_name(request["user_id"], request["new_value"]["name"])
            resolved = self._requests.get(request_id)
        # An approved email doesn't change anything yet — the user confirms
        # it from their profile page (send_email_confirmation).
        return with_derived_fields(resolved)

    def send_email_confirmation(
        self, request_id: str, profile: dict, access_token: str, auth: AuthIdentityRepository, redirect_to: str
    ) -> dict:
        request = self._requests.get(request_id)
        if request is None or request["user_id"] != profile["id"]:
            raise ProfileEditNotFoundError()
        request = with_derived_fields(request)
        if not request["awaiting_email_confirmation"]:
            raise NoEmailChangeToConfirmError()
        auth.request_email_change(access_token, request["new_value"]["email"], redirect_to)
        return request
