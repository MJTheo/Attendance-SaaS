from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    # Reserved for future direct-Postgres needs (e.g. migration tooling); the
    # app itself talks to Supabase over its REST/PostgREST API, not this URL.
    database_url: str

    supabase_url: str
    supabase_secret_key: str
    supabase_publishable_key: str

    environment: str = "development"
    api_port: int = 8000
    cors_origins: str = "http://localhost:5173"
    # Used to build the redirect link in staff-invite emails. Must also be
    # added to the Supabase project's Auth > URL Configuration allow-list,
    # or Supabase silently ignores it and falls back to the Site URL.
    frontend_url: str = "http://localhost:5173"
    report_schedule_cron: str = "0 6 * * 1"

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")

    @property
    def cors_origin_list(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]


@lru_cache
def get_settings() -> Settings:
    return Settings()
