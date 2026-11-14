"""
Vitals API routes.

Saves heart rate / breathing rate for a check-in and records whether
the values were manually entered (test/demo) or camera-estimated.
"""

from datetime import datetime
from enum import Enum
from uuid import UUID

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from app.database import get_check_in, get_patient, save_vitals

router = APIRouter(prefix="/vitals", tags=["vitals"])


class MeasurementSource(str, Enum):
    """
    Where the vital values came from.

    manual           = entered for testing/demo (NOT camera-estimated)
    camera_estimated = produced by the camera pipeline (not clinically validated)
    """

    manual = "manual"
    camera_estimated = "camera_estimated"


class VitalsCreate(BaseModel):
    """Body for POST /vitals."""

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
    heart_rate: float = Field(
        ...,
        gt=0,
        description="Heart rate value. Not clinically validated.",
        examples=[72],
    )
    breathing_rate: float = Field(
        ...,
        gt=0,
        description="Breathing rate value. Not clinically validated.",
        examples=[16],
    )
    measurement_source: MeasurementSource = Field(
        ...,
        description=(
            "Use 'manual' for test/demo entries. "
            "Use 'camera_estimated' only for real camera-pipeline values. "
            "Never label manual values as camera_estimated."
        ),
        examples=["manual"],
    )


class VitalsItem(BaseModel):
    """One vitals row returned after save."""

    id: UUID
    patient_id: UUID
    check_in_id: UUID
    heart_rate: float | None = None
    breathing_rate: float | None = None
    measurement_source: MeasurementSource | None = None
    measured_at: datetime | None = None


class VitalsCreateResponse(BaseModel):
    """Success response for POST /vitals."""

    message: str
    note: str
    vitals_id: UUID
    vitals: VitalsItem


@router.post("", response_model=VitalsCreateResponse)
@router.post("/", response_model=VitalsCreateResponse, include_in_schema=False)
async def create_vitals(body: VitalsCreate):
    """
    Save vital measurements for a patient check-in.

    Requires measurement_source so manual test data is never confused
    with camera-estimated values. Does not diagnose or validate clinically.
    """
    patient_id_str = str(body.patient_id)
    check_in_id_str = str(body.check_in_id)

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
                "Create the patient in Supabase first, then retry."
            ),
        )

    try:
        check_in = get_check_in(check_in_id_str)
    except Exception as exc:
        raise HTTPException(
            status_code=503,
            detail=(
                "Could not reach the database while looking up the check-in. "
                f"Details: {exc}"
            ),
        ) from exc

    if check_in is None:
        raise HTTPException(
            status_code=404,
            detail=(
                f"No check-in found with id '{check_in_id_str}'. "
                "Create a check-in with POST /check-ins first, then retry."
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

    try:
        created = save_vitals(
            patient_id=patient_id_str,
            check_in_id=check_in_id_str,
            heart_rate=body.heart_rate,
            breathing_rate=body.breathing_rate,
            measurement_source=body.measurement_source.value,
        )
    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=(
                "Could not save vitals. If this mentions measurement_source, "
                "run scripts/add_vitals_measurement_source.sql in the "
                f"Supabase SQL Editor first. Details: {exc}"
            ),
        ) from exc

    vitals_id = created.get("id")
    if not vitals_id:
        raise HTTPException(
            status_code=500,
            detail="Vitals were saved but no id was returned by Supabase.",
        )

    return VitalsCreateResponse(
        message="Vitals saved successfully.",
        note=(
            "These measurements are not clinically validated and are not a "
            "medical diagnosis. Source label: "
            f"{body.measurement_source.value}."
        ),
        vitals_id=vitals_id,
        vitals=created,
    )
