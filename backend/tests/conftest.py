import os

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
