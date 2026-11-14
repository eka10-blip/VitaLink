"""
Patient API routes for the VitaLink dashboard.
"""

from datetime import datetime
from uuid import UUID

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.database import get_patient

router = APIRouter(prefix="/patients", tags=["patients"])


class PatientItem(BaseModel):
    """One patient row returned to the dashboard."""

    id: UUID
    name: str
    age: int | None = None
    medical_history: str | None = None
    created_at: datetime | None = None


class PatientResponse(BaseModel):
    """Success response for GET /patients/{patient_id}."""

    message: str
    patient: PatientItem


@router.get("/{patient_id}", response_model=PatientResponse)
async def get_patient_by_id(patient_id: UUID):
    """
    Return basic information for one patient.
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

    return PatientResponse(
        message="Patient retrieved successfully.",
        patient=patient,
    )
