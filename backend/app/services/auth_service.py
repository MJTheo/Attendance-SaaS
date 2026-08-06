from supabase import Client

from app.repositories.users import UsersRepository


class OrgAlreadyProvisionedError(Exception):
    pass


class MissingEmailClaimError(Exception):
    pass


class AuthService:
    """Provisions the org + admin profile row after Supabase Auth has already
    created the underlying auth identity. Always constructed with the
    service-role client — see get_service_role_client for why."""

    def __init__(self, service_client: Client):
        self._client = service_client

    def signup_organization(self, user_id: str, email: str | None, org_name: str, admin_name: str) -> dict:
        if not email:
            raise MissingEmailClaimError()

        if UsersRepository(self._client).get_profile(user_id) is not None:
            raise OrgAlreadyProvisionedError()

        response = self._client.rpc(
            "create_organization_with_admin",
            {
                "org_name": org_name,
                "admin_id": user_id,
                "admin_name": admin_name,
                "admin_email": email,
            },
        ).execute()
        return response.data[0]
