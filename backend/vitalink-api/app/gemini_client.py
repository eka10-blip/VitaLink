"""
Google Gemini API client for VitaLink Backend.

Handles connecting to Gemini and sending prompts.
Keeps raw AI API details in one place so the rest of the app stays simple.

The API key is read from .env (GEMINI_API_KEY) and must never be returned
in HTTP responses.
"""

from typing import Any

from google import genai

from app import config
from app.config import reload_settings

PLACEHOLDER_GEMINI_API_KEY = "your-gemini-api-key"


def get_gemini_client() -> genai.Client:
    """
    Return a Gemini client configured from environment settings.

    Raises:
        ValueError: if GEMINI_API_KEY is missing or still a placeholder.
    """
    current = config.settings
    api_key = (current.gemini_api_key or "").strip()

    if not api_key:
        raise ValueError(
            "Missing Gemini credentials. "
            "Set GEMINI_API_KEY in your .env file, then save it."
        )

    if api_key == PLACEHOLDER_GEMINI_API_KEY:
        raise ValueError(
            "Your .env still has the example GEMINI_API_KEY placeholder. "
            "Replace it with a real key from Google AI Studio, then save."
        )

    return genai.Client(api_key=api_key)


def generate_text(prompt: str, model: str | None = None) -> str:
    """
    Send a prompt to Gemini and return the text response.

    Args:
        prompt: The full text prompt for the model.
        model: Optional model name override (defaults to GEMINI_MODEL).

    Returns:
        The model's text output as a string.
    """
    current = config.settings
    model_name = model or current.gemini_model or "gemini-3.5-flash-lite"
    client = get_gemini_client()

    response = client.models.generate_content(
        model=model_name,
        contents=prompt,
    )

    text = getattr(response, "text", None)
    if not text:
        raise RuntimeError("Gemini returned an empty response.")

    return text


def test_gemini_connection() -> dict[str, Any]:
    """
    Send a tiny test prompt to Gemini to verify the API key works.

    Never includes the API key in the returned dict.
    """
    reload_settings()

    current = config.settings
    model_name = current.gemini_model or "gemini-3.5-flash-lite"
    test_prompt = (
        "Reply with exactly one short sentence confirming you are working "
        "for the VitaLink health check-in demo."
    )

    try:
        reply = generate_text(test_prompt, model=model_name)
        return {
            "ok": True,
            "message": "Connected to Gemini successfully.",
            "model": model_name,
            "prompt": test_prompt,
            "response": reply,
            "env_check": {
                "gemini_api_key_loaded": bool((current.gemini_api_key or "").strip()),
                "gemini_api_key_is_placeholder": (
                    (current.gemini_api_key or "").strip() == PLACEHOLDER_GEMINI_API_KEY
                ),
                "gemini_model": model_name,
            },
        }
    except Exception as exc:
        # Sanitize error text in case a library message includes the key
        raw = str(exc)
        key = (current.gemini_api_key or "").strip()
        if key and key in raw:
            raw = raw.replace(key, "[REDACTED]")

        return {
            "ok": False,
            "message": "Could not connect to Gemini.",
            "model": model_name,
            "error": raw,
            "env_check": {
                "gemini_api_key_loaded": bool(key),
                "gemini_api_key_is_placeholder": key == PLACEHOLDER_GEMINI_API_KEY,
                "gemini_model": model_name,
            },
        }
