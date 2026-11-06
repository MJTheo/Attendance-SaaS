import os

import pytest

# app.config.Settings has required fields with no defaults; tests never talk
# to Supabase, so placeholder values are enough to let app modules import.
# setdefault so a real .env-driven environment isn't clobbered.
for key, value in {
    "DATABASE_URL": "postgresql://test:test@localhost:5432/test",
    "SUPABASE_URL": "http://localhost:54321",
    "SUPABASE_SECRET_KEY": "test-secret-key",
    "SUPABASE_PUBLISHABLE_KEY": "test-publishable-key",
    "SIGNUP_TOTP_SECRET": "JBSWY3DPEHPK3PXP",
}.items():
    os.environ.setdefault(key, value)



@pytest.fixture
def frozen_now(monkeypatch):
    """Freeze "now" for a module that calls datetime.now(tz): replaces that
    module's `datetime` name with a subclass whose now() returns `when` in
    the requested zone. Every other datetime method keeps working."""
    from datetime import datetime

    def freeze(module, when: datetime) -> None:
        class FrozenDatetime(datetime):
            @classmethod
            def now(cls, tz=None):
                return when.astimezone(tz) if tz else when

        monkeypatch.setattr(module, "datetime", FrozenDatetime)

    return freeze
