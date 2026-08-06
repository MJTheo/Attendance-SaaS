from dataclasses import dataclass
from functools import lru_cache

import jwt
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from jwt import PyJWKClient

from app.config import get_settings

bearer_scheme = HTTPBearer(auto_error=False)


@dataclass(frozen=True)
class CurrentUser:
    id: str
    email: str | None
    access_token: str


@lru_cache
def _jwks_client() -> PyJWKClient:
    """Supabase signs access tokens with an asymmetric key (ES256) and
    publishes the public half at this well-known JWKS endpoint — no secret
    involved, safe to fetch and cache. This is why there's no
    SUPABASE_JWT_SECRET setting: a static shared secret only works for
    projects still on the legacy HS256 scheme, and this project isn't."""
    settings = get_settings()
    return PyJWKClient(f"{settings.supabase_url}/auth/v1/.well-known/jwks.json", cache_keys=True)


def decode_current_user(
    credentials: HTTPAuthorizationCredentials | None = Depends(bearer_scheme),
) -> CurrentUser:
    """Verifies the caller's Supabase access token and extracts identity.

    The raw token is kept on CurrentUser so it can be forwarded as-is to a
    per-request Supabase client (see get_user_client in dependencies.py) —
    that's what makes Postgres RLS apply to this request.
    """
    if credentials is None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Missing bearer token")

    try:
        signing_key = _jwks_client().get_signing_key_from_jwt(credentials.credentials)
        payload = jwt.decode(
            credentials.credentials,
            signing_key.key,
            algorithms=["ES256"],
            audience="authenticated",
        )
    except Exception as exc:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Invalid or expired token") from exc

    user_id = payload.get("sub")
    if not user_id:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "Token missing subject claim")

    return CurrentUser(id=user_id, email=payload.get("email"), access_token=credentials.credentials)
