"""
Environment configuration for VitaLink Backend.

Loads secrets and settings from a .env file (or real environment variables).
Never hardcode API keys here — put them in .env instead.
"""

from pathlib import Path

from dotenv import load_dotenv
from pydantic_settings import BaseSettings, SettingsConfigDict

# Project root = folder that contains .env (one level above app/)
PROJECT_ROOT = Path(__file__).resolve().parent.parent
ENV_FILE = PROJECT_ROOT / ".env"

# Exact placeholder strings from .env.example (used for validation only)
PLACEHOLDER_SUPABASE_URL = "https://your-project-ref.supabase.co"
PLACEHOLDER_SUPABASE_KEY = "your-supabase-anon-or-service-role-key"


def load_env_file() -> bool:
    """
    Load the project-root .env into the process environment.

    override=True means values in .env win over older process env values.
    Returns True if the .env file was found and read.
    """
    return load_dotenv(dotenv_path=ENV_FILE, override=True)


# Load once at import time
load_env_file()


class Settings(BaseSettings):
    """App settings read from environment variables."""

    # Supabase — maps to SUPABASE_URL and SUPABASE_KEY in .env
    supabase_url: str = ""
    supabase_key: str = ""

    # Google Gemini — maps to GEMINI_API_KEY and GEMINI_MODEL in .env
    gemini_api_key: str = ""
    gemini_model: str = "gemini-3.5-flash-lite"

    model_config = SettingsConfigDict(
        env_file=str(ENV_FILE),
        env_file_encoding="utf-8",
        extra="ignore",
    )


# Shared settings object used across the app
settings = Settings()


def reload_settings() -> Settings:
    """
    Re-read .env into the shared settings object.

    Useful for /supabase-test so saving .env shows up without a full restart.
    """
    global settings
    load_env_file()
    settings = Settings()
    return settings


def supabase_env_status() -> dict:
    """
    Safe status for debugging env loading (never includes secret values).
    """
    current = settings
    url = current.supabase_url or ""
    key = current.supabase_key or ""

    url_is_placeholder = (not url) or url.strip() == PLACEHOLDER_SUPABASE_URL
    key_is_placeholder = (not key) or key.strip() == PLACEHOLDER_SUPABASE_KEY

    return {
        "dotenv_installed": True,
        "load_dotenv_called": True,
        "env_file_path": str(ENV_FILE),
        "env_file_exists": ENV_FILE.exists(),
        "supabase_url_loaded": bool(url),
        "supabase_key_loaded": bool(key),
        "supabase_url_name_ok": True,  # Settings maps SUPABASE_URL
        "supabase_key_name_ok": True,  # Settings maps SUPABASE_KEY
        "supabase_url_is_placeholder": url_is_placeholder,
        "supabase_key_is_placeholder": key_is_placeholder,
        "ready": (not url_is_placeholder) and (not key_is_placeholder),
    }
