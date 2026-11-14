"""
Supabase database connection for VitaLink Backend.

Creates one shared Supabase client used by routes and services
to read/write patients, care plans, check-ins, vitals, and reports.

Credentials come from .env via app.config — never hardcode keys here.
"""

from datetime import datetime, timezone
from functools import lru_cache
from typing import Any

from supabase import Client, create_client

from app import config
from app.config import (
    PLACEHOLDER_SUPABASE_KEY,
    PLACEHOLDER_SUPABASE_URL,
    reload_settings,
)


@lru_cache
def get_supabase() -> Client:
    """
    Return a single shared Supabase client.

    Raises:
        ValueError: if SUPABASE_URL or SUPABASE_KEY is missing from .env.
    """
    # Read via config.settings so reload_settings() is always picked up
    current = config.settings
    url = (current.supabase_url or "").strip()
    key = (current.supabase_key or "").strip()

    if not url or not key:
        raise ValueError(
            "Missing Supabase credentials. "
            "Set SUPABASE_URL and SUPABASE_KEY in your .env file, then save it."
        )

    # Only reject the exact example strings from .env.example
    if url == PLACEHOLDER_SUPABASE_URL or key == PLACEHOLDER_SUPABASE_KEY:
        raise ValueError(
            "The on-disk .env file still has the example placeholder values "
            f"from .env.example (file: {config.ENV_FILE}). "
            "Paste your real SUPABASE_URL and SUPABASE_KEY from "
            "Supabase > Project Settings > API, then SAVE the file "
            "(Cmd+S) and refresh /supabase-test."
        )

    return create_client(url, key)




def reset_supabase_client() -> None:
    """Clear the cached client so the next call re-reads credentials."""
    get_supabase.cache_clear()


def test_supabase_connection() -> dict[str, Any]:
    """
    Try a simple read against the patients table.

    This does NOT change any data. It only checks that:
    1. Credentials load from .env
    2. The Supabase client can talk to your project
    3. The patients table is reachable

    Returns:
        A dict with ok=True/False and a short message (plus optional details).
    """
    # Always re-read .env for this test so edits show up immediately
    reload_settings()
    reset_supabase_client()

    try:
        client = get_supabase()

        # Light read: ask for at most 1 row from patients (no schema changes)
        response = client.table("patients").select("id").limit(1).execute()

        row_count = len(response.data or [])
        return {
            "ok": True,
            "message": "Connected to Supabase successfully.",
            "patients_sample_rows": row_count,
            "hint": (
                "0 rows is fine if you have not inserted patients yet - "
                "the connection still worked."
            ),
        }
    except Exception as exc:  # beginner-friendly: return error instead of crashing
        return {
            "ok": False,
            "message": "Could not connect to Supabase.",
            "error": str(exc),
        }


def get_patient(patient_id: str) -> dict[str, Any] | None:
    """
    Look up one patient by id.

    Returns:
        The patient row as a dict, or None if no patient matches.
    """
    client = get_supabase()
    response = (
        client.table("patients")
        .select("*")
        .eq("id", patient_id)
        .limit(1)
        .execute()
    )
    rows = response.data or []
    return rows[0] if rows else None


def save_check_in(patient_id: str, transcript: str) -> dict[str, Any]:
    """
    Insert a new check-in row for a patient.

    Args:
        patient_id: UUID of an existing patient.
        transcript: Conversation transcript text.

    Returns:
        The newly created check-in row (includes generated id).

    Raises:
        ValueError: if Supabase did not return the inserted row.
    """
    client = get_supabase()
    row = {
        "patient_id": patient_id,
        "transcript": transcript,
        # Store when the check-in happened (UTC).
        "occurred_at": datetime.now(timezone.utc).isoformat(),
    }
    response = client.table("check_ins").insert(row).execute()
    rows = response.data or []
    if not rows:
        raise ValueError("Supabase did not return the new check-in row.")
    return rows[0]


def get_check_ins_for_patient(patient_id: str) -> list[dict[str, Any]]:
    """
    Return all check-ins for a patient, newest first.

    Args:
        patient_id: UUID of the patient.

    Returns:
        A list of check-in rows (may be empty).
    """
    client = get_supabase()
    response = (
        client.table("check_ins")
        .select("*")
        .eq("patient_id", patient_id)
        .order("occurred_at", desc=True)
        .execute()
    )
    return response.data or []


def get_check_in(check_in_id: str) -> dict[str, Any] | None:
    """
    Look up one check-in by id.

    Returns:
        The check-in row as a dict, or None if not found.
    """
    client = get_supabase()
    response = (
        client.table("check_ins")
        .select("*")
        .eq("id", check_in_id)
        .limit(1)
        .execute()
    )
    rows = response.data or []
    return rows[0] if rows else None


def get_care_plan(patient_id: str) -> dict[str, Any] | None:
    """
    Return the most recent care plan for a patient, if any.

    Returns:
        The newest care_plans row, or None if the patient has none yet.
    """
    client = get_supabase()
    response = (
        client.table("care_plans")
        .select("*")
        .eq("patient_id", patient_id)
        .order("created_at", desc=True)
        .limit(1)
        .execute()
    )
    rows = response.data or []
    return rows[0] if rows else None


def get_vitals_for_check_in(check_in_id: str) -> list[dict[str, Any]]:
    """
    Return vitals rows linked to a specific check-in.

    Returns:
        A list of vitals rows (may be empty if none were recorded).
    """
    client = get_supabase()
    response = (
        client.table("vitals")
        .select("*")
        .eq("check_in_id", check_in_id)
        .order("measured_at", desc=True)
        .execute()
    )
    return response.data or []


def save_health_report(
    patient_id: str,
    check_in_id: str,
    summary: str,
    report: dict[str, Any],
    needs_human_review: bool,
) -> dict[str, Any]:
    """
    Insert a generated health report into health_reports.

    Returns:
        The newly created health_reports row.

    Raises:
        ValueError: if Supabase did not return the inserted row.
    """
    client = get_supabase()
    row = {
        "patient_id": patient_id,
        "check_in_id": check_in_id,
        "summary": summary,
        "report": report,
        "needs_human_review": needs_human_review,
    }
    response = client.table("health_reports").insert(row).execute()
    rows = response.data or []
    if not rows:
        raise ValueError("Supabase did not return the new health report row.")
    return rows[0]


def get_health_reports(patient_id: str) -> list[dict[str, Any]]:
    """
    Return all health reports for a patient, newest first.

    Args:
        patient_id: UUID of the patient.

    Returns:
        A list of health_reports rows (may be empty).
    """
    client = get_supabase()
    response = (
        client.table("health_reports")
        .select(
            "id, patient_id, check_in_id, summary, report, "
            "needs_human_review, created_at"
        )
        .eq("patient_id", patient_id)
        .order("created_at", desc=True)
        .execute()
    )
    return response.data or []


def get_health_report(report_id: str) -> dict[str, Any] | None:
    """
    Look up one health report by id.

    Returns:
        The health_reports row as a dict, or None if not found.
    """
    client = get_supabase()
    response = (
        client.table("health_reports")
        .select(
            "id, patient_id, check_in_id, summary, report, "
            "needs_human_review, created_at"
        )
        .eq("id", report_id)
        .limit(1)
        .execute()
    )
    rows = response.data or []
    return rows[0] if rows else None


def save_vitals(
    patient_id: str,
    check_in_id: str,
    heart_rate: float,
    breathing_rate: float,
    measurement_source: str,
) -> dict[str, Any]:
    """
    Insert a vitals row linked to a patient + check-in.

    measurement_source must be:
      - "manual"            → entered for testing/demo (NOT camera-estimated)
      - "camera_estimated"  → produced by the camera pipeline

    Values are never claimed to be clinically validated.

    Returns:
        The newly created vitals row.

    Raises:
        ValueError: if Supabase did not return the inserted row.
    """
    if measurement_source not in ("manual", "camera_estimated"):
        raise ValueError(
            "measurement_source must be 'manual' or 'camera_estimated'."
        )

    client = get_supabase()
    row = {
        "patient_id": patient_id,
        "check_in_id": check_in_id,
        "heart_rate": heart_rate,
        "breathing_rate": breathing_rate,
        "measurement_source": measurement_source,
        "measured_at": datetime.now(timezone.utc).isoformat(),
    }
    response = client.table("vitals").insert(row).execute()
    rows = response.data or []
    if not rows:
        raise ValueError("Supabase did not return the new vitals row.")
    return rows[0]


# TODO (later): helper functions for remaining tables, for example:
