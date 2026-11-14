"""
Care plan API routes for the VitaLink dashboard.
"""

from datetime import datetime
from uuid import UUID

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.database import get_care_plan, get_patient

router = APIRouter(prefix="/care-plans", tags=["care-plans"])


class CarePlanItem(BaseModel):
    """One care plan row returned to the dashboard."""

    id: UUID
    patient_id: UUID
    instructions: str | None = None
    health_concerns: list[str] | None = None
    created_at: datetime | None = None


class CarePlanResponse(BaseModel):
    """Success response for GET /care-plans/{patient_id}."""

    message: str
    patient_id: UUID
    care_plan: CarePlanItem


@router.get("/{patient_id}", response_model=CarePlanResponse)
async def get_care_plan_for_patient(patient_id: UUID):
    """
    Return the most recent care plan for a patient.
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
        care_plan = get_care_plan(patient_id_str)
    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=f"Could not load the care plan. Details: {exc}",
        ) from exc

    if care_plan is None:
        raise HTTPException(
            status_code=404,
            detail=(
                f"No care plan found for patient '{patient_id_str}'. "
                "Add a care plan in Supabase, then retry."
            ),
        )

    return CarePlanResponse(
        message="Care plan retrieved successfully.",
        patient_id=patient_id,
        care_plan=care_plan,
    )
