from supabase import AuthApiError, Client

from app.repositories.users import UsersRepository


class InviteEmailInUseError(Exception):
    pass


class InviteRateLimitedError(Exception):
    pass


class InviteFailedError(Exception):
    pass


class DemoOrgInviteBlockedError(Exception):
    pass


class InvitesService:
    """Invites a new staff member. Creating the underlying Supabase Auth
    identity requires the admin API (service-role client) — ordinary users
    can't create other auth identities, there's no RLS-based way around it.
    The org profile row is then written through the *inviting admin's own*
    RLS-checked client, not service role, so tenant scoping for that write
    is still enforced by Postgres rather than trusted here."""

    def __init__(self, user_client: Client, service_client: Client):
        self._user_client = user_client
        self._service_client = service_client

    def invite_staff(self, org_id: str, email: str, name: str, redirect_to: str) -> dict:
        # The public demo org's admin login is shared/public — invite_user_by_email
        # sends a real email to whatever address is typed in, so this is blocked
        # server-side, not just hidden in the UI (a hidden button doesn't stop
        # someone from calling the API directly).
        org_rows = self._user_client.table("organizations").select("plan").eq("id", org_id).limit(1).execute().data
        if org_rows and org_rows[0]["plan"] == "demo":
            raise DemoOrgInviteBlockedError()

        try:
            invited = self._service_client.auth.admin.invite_user_by_email(
                email, {"redirect_to": redirect_to}
            )
        except AuthApiError as exc:
            if exc.code == "email_exists":
                raise InviteEmailInUseError() from exc
            if exc.code == "over_email_send_rate_limit":
                raise InviteRateLimitedError() from exc
            raise InviteFailedError(str(exc)) from exc

        try:
            return UsersRepository(self._user_client).create(
                user_id=invited.user.id, org_id=org_id, role="staff", name=name, email=email
            )
        except Exception as exc:
            # Don't leave an orphaned auth identity with no org profile behind.
            self._service_client.auth.admin.delete_user(invited.user.id)
            raise InviteFailedError() from exc
