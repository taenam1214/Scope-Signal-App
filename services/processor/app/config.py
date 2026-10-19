"""Runtime configuration, loaded from environment variables."""

from __future__ import annotations

from functools import lru_cache
from typing import Literal

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", extra="ignore")

    app_env: Literal["development", "production"] = "development"

    # AI — "mock" uses the deterministic offline adapter (no network calls).
    ai_mode: Literal["mock", "live"] = "mock"
    openai_api_key: str = ""
    openai_model: str = "gpt-4o-mini"

    # Worker / queue
    redis_url: str = "redis://127.0.0.1:6379/0"
    worker_auth_secret: str = "change-me-in-dev"

    # Supabase (server-side access for the worker)
    supabase_url: str = ""
    supabase_service_role_key: str = ""
    database_url: str = ""


@lru_cache
def get_settings() -> Settings:
    return Settings()
