"""
Health report generation API routes.

Creates AI-assisted caregiver summaries from a patient's check-in,
care plan, and any camera-estimated vitals.
"""

from uuid import UUID

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from app import config
from app.database import (
    get_care_plan,
    get_check_in,
    get_patient,
    get_vitals_for_check_in,
    save_health_report,
)
from app.report_generator import generate_health_report

router = APIRouter(prefix="/health-reports", tags=["health-reports"])


# ---- Request / response shapes ----


class HealthReportCreate(BaseModel):
    """Body for POST /health-reports."""

    patient_id: UUID = Field(
        ...,
        description="UUID of an existing patient.",
        examples=["666bdf72-866f-437a-a3b5-f14e21899582"],
    )
    check_in_id: UUID = Field(
        ...,
        description="UUID of a check-in that belongs to this patient.",
        examples=["9c94ab6d-a229-45ab-940e-0ee900a6a446"],
    )


class HealthReportCreateResponse(BaseModel):
    """Success response for POST /health-reports."""

    message: str
    health_report_id: UUID
    summary: str
    needs_human_review: bool
    report: dict


def _safe_error_text(exc: Exception) -> str:
    """Remove API keys from error text before returning it to clients."""
    raw = str(exc)
    key = (config.settings.gemini_api_key or "").strip()
    if key and key in raw:
        raw = raw.replace(key, "[REDACTED]")
    supabase_key = (config.settings.supabase_key or "").strip()
    if supabase_key and supabase_key in raw:
        raw = raw.replace(supabase_key, "[REDACTED]")
    return raw


# ---- Endpoints ----


@router.post("", response_model=HealthReportCreateResponse)
@router.post("/", response_model=HealthReportCreateResponse, include_in_schema=False)
async def create_health_report(body: HealthReportCreate):
    """
    Build a structured health report for one check-in using Gemini.

    Steps:
    1. Validate patient_id + check_in_id.
    2. Load patient, check-in, care plan, and vitals from Supabase.
    3. Confirm the check-in belongs to the patient.
    4. Ask Gemini for a structured JSON summary (no diagnoses).
    5. Save the result in health_reports and return it.
    """
    patient_id_str = str(body.patient_id)
    check_in_id_str = str(body.check_in_id)

    # 1) Load patient
    try:
        patient = get_patient(patient_id_str)
    except Exception as exc:
        raise HTTPException(
            status_code=503,
            detail=(
                "Could not reach the database while looking up the patient. "
                f"Details: {_safe_error_text(exc)}"
            ),
        ) from exc

    if patient is None:
        raise HTTPException(
            status_code=404,
            detail=(
                f"No patient found with id '{patient_id_str}'. "
                "Create the patient in Supabase first, then retry."
            ),
        )

    # 2) Load check-in and confirm it belongs to this patient
    try:
        check_in = get_check_in(check_in_id_str)
    except Exception as exc:
        raise HTTPException(
            status_code=503,
            detail=(
                "Could not reach the database while looking up the check-in. "
                f"Details: {_safe_error_text(exc)}"
            ),
        ) from exc

    if check_in is None:
        raise HTTPException(
            status_code=404,
            detail=(
                f"No check-in found with id '{check_in_id_str}'. "
                "Create a check-in first with POST /check-ins, then retry."
            ),
        )

    if str(check_in.get("patient_id")) != patient_id_str:
        raise HTTPException(
            status_code=400,
            detail=(
                f"Check-in '{check_in_id_str}' does not belong to "
                f"patient '{patient_id_str}'."
            ),
        )

    # 3) Load optional care plan + vitals (missing data is OK)
    try:
        care_plan = get_care_plan(patient_id_str)
        vitals = get_vitals_for_check_in(check_in_id_str)
    except Exception as exc:
        raise HTTPException(
            status_code=503,
            detail=(
                "Could not load care plan or vitals from the database. "
                f"Details: {_safe_error_text(exc)}"
            ),
        ) from exc

    # 4) Ask Gemini for a structured report
    try:
        generated = generate_health_report(
            patient=patient,
            care_plan=care_plan,
            check_in=check_in,
            vitals=vitals,
        )
    except Exception as exc:
        raise HTTPException(
            status_code=502,
            detail=(
                "Could not generate the health report with Gemini. "
                f"Details: {_safe_error_text(exc)}"
            ),
        ) from exc

    # 5) Save to health_reports
    try:
        saved = save_health_report(
            patient_id=patient_id_str,
            check_in_id=check_in_id_str,
            summary=generated["summary"],
            report=generated["report"],
            needs_human_review=generated["needs_human_review"],
        )
    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=(
                "Gemini generated a report, but saving it to Supabase failed. "
                f"Details: {_safe_error_text(exc)}"
            ),
        ) from exc

    health_report_id = saved.get("id")
    if not health_report_id:
        raise HTTPException(
            status_code=500,
            detail="Health report was saved but no id was returned by Supabase.",
        )

    return HealthReportCreateResponse(
        message="Health report generated and saved successfully.",
        health_report_id=health_report_id,
        summary=saved.get("summary") or generated["summary"],
        needs_human_review=bool(saved.get("needs_human_review")),
        report=saved.get("report") or generated["report"],
    )
