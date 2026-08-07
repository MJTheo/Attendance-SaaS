import pyotp
from supabase import Client

from app.repositories.users import UsersRepository


class OrgAlreadyProvisionedError(Exception):
    pass


class MissingEmailClaimError(Exception):
    pass


class InvalidAccessCodeError(Exception):
    pass


class AuthService:
    """Provisions the org + admin profile row after Supabase Auth has already
    created the underlying auth identity. Always constructed with the
    service-role client — see get_service_role_client for why."""

    def __init__(self, service_client: Client, signup_totp_secret: str):
        self._client = service_client
        self._totp = pyotp.TOTP(signup_totp_secret)

    def signup_organization(
        self, user_id: str, email: str | None, org_name: str, admin_name: str, access_code: str
    ) -> dict:
        # valid_window=6 accepts a code up to ~3 minutes old (or new) on either
        # side of now (each step is 30s) — wide enough that a code can be
        # handed to someone else without both parties acting within 30s, while
        # still expiring on a short enough horizon to matter as a gate.
        if not self._totp.verify(access_code, valid_window=6):
            raise InvalidAccessCodeError()

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
