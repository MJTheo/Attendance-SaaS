import httpx


class EmailInUseError(Exception):
    pass


class EmailRateLimitedError(Exception):
    pass


class EmailChangeFailedError(Exception):
    pass


class AuthIdentityRepository:
    """Supabase Auth calls made *as the signed-in user* (their own access
    token), for the parts of a profile that live in auth.users rather than
    Postgres tables."""

    def __init__(self, supabase_url: str, publishable_key: str):
        self._url = supabase_url.rstrip("/")
        self._key = publishable_key

    def request_email_change(self, access_token: str, new_email: str, redirect_to: str) -> None:
        # Same call as supabase-js auth.updateUser({ email }): Supabase emails
        # a confirmation link (to the old address too, if the project's
        # "Secure email change" setting is on) and only switches the login
        # once it's clicked.
        response = httpx.put(
            f"{self._url}/auth/v1/user",
            params={"redirect_to": redirect_to},
            headers={"apikey": self._key, "Authorization": f"Bearer {access_token}"},
            json={"email": new_email},
            timeout=20,
        )
        if response.status_code < 400:
            return
        code = (response.json() if response.headers.get("content-type", "").startswith("application/json") else {}).get(
            "error_code"
        )
        if code == "email_exists":
            raise EmailInUseError()
        if code == "over_email_send_rate_limit" or response.status_code == 429:
            raise EmailRateLimitedError()
        raise EmailChangeFailedError(f"{response.status_code} {response.text[:200]}")
