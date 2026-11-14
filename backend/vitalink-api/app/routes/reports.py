"""
Health report API routes.

Person 4 (patient + family dashboard) will call these endpoints
to fetch generated health reports for a patient.
"""

from datetime import datetime
from typing import Any
from uuid import UUID

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.database import get_health_report, get_health_reports, get_patient

router = APIRouter(prefix="/reports", tags=["reports"])


# ---- Response shapes (for validation + clear /docs) ----


class HealthReportItem(BaseModel):
    """One health report row returned to the dashboard."""

    id: UUID
    patient_id: UUID
    check_in_id: UUID
    summary: str
    report: dict[str, Any]
    needs_human_review: bool
    created_at: datetime | None = None


class PatientReportsResponse(BaseModel):
    """Success response for GET /reports/patient/{patient_id}."""

    message: str
    patient_id: UUID
    count: int
    reports: list[HealthReportItem]


class SingleReportResponse(BaseModel):
    """Success response for GET /reports/{report_id}."""

    message: str
    report: HealthReportItem


# ---- Endpoints ----


@router.get("/patient/{patient_id}", response_model=PatientReportsResponse)
async def get_reports_for_patient(patient_id: UUID):
    """
    Return all health reports for a patient, newest first.

    Includes id, check_in_id, summary, needs_human_review, report JSON,
    and created_at for each report.
    """
    patient_id_str = str(patient_id)

    try:
        patient = get_patient(patient_id_str)
    except Exception as exc:
        raise HTTPException(
            status_code=503,
            detail=(
                "Could not reach the database while looking up the patient. "
                f"Details: {exc}"
            ),
        ) from exc

    if patient is None:
        raise HTTPException(
            status_code=404,
            detail=(
                f"No patient found with id '{patient_id_str}'. "
                "Double-check the patient_id and try again."
            ),
        )

    try:
        reports = get_health_reports(patient_id_str)
    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=f"Could not load health reports. Details: {exc}",
        ) from exc

    return PatientReportsResponse(
        message="Health reports retrieved successfully.",
        patient_id=patient_id,
        count=len(reports),
        reports=reports,
    )


@router.get("/{report_id}", response_model=SingleReportResponse)
async def get_report(report_id: UUID):
    """
    Return a single health report by id.
    """
    report_id_str = str(report_id)

    try:
        report = get_health_report(report_id_str)
    except Exception as exc:
        raise HTTPException(
            status_code=503,
            detail=(
                "Could not reach the database while looking up the report. "
                f"Details: {exc}"
            ),
        ) from exc

    if report is None:
        raise HTTPException(
            status_code=404,
            detail=(
                f"No health report found with id '{report_id_str}'. "
                "Generate one with POST /health-reports, then retry."
            ),
        )

    return SingleReportResponse(
        message="Health report retrieved successfully.",
        report=report,
    )
