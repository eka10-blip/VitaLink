"""
Check-in API routes.

Person 1 (Chert + ElevenLabs) and Person 2 (LiveKit + Presage)
will call these endpoints to submit transcripts (and later vitals).
"""

from uuid import UUID

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field, field_validator

from app.database import get_check_ins_for_patient, get_patient, save_check_in

router = APIRouter(prefix="/check-ins", tags=["check-ins"])


# ---- Request / response shapes (for validation + clear /docs) ----


class CheckInCreate(BaseModel):
    """Body for POST /check-ins."""

    patient_id: UUID = Field(
        ...,
        description="UUID of an existing patient in the patients table.",
        examples=["666bdf72-866f-437a-a3b5-f14e21899582"],
    )
    transcript: str = Field(
        ...,
        min_length=1,
        description="Conversation transcript from the check-in.",
        examples=["Patient said they slept well and feel less dizzy today."],
    )

    @field_validator("transcript")
    @classmethod
    def transcript_must_not_be_blank(cls, value: str) -> str:
        cleaned = value.strip()
        if not cleaned:
            raise ValueError("transcript cannot be empty or only whitespace")
        return cleaned


class CheckInCreateResponse(BaseModel):
    """Success response for POST /check-ins."""

    message: str
    check_in_id: UUID


# ---- Endpoints ----


@router.post("", response_model=CheckInCreateResponse)
@router.post("/", response_model=CheckInCreateResponse, include_in_schema=False)
async def create_check_in(body: CheckInCreate):
    """
    Save a new patient check-in (transcript) to Supabase.

    Steps:
    1. Validate patient_id + transcript (Pydantic does this first).
    2. Confirm the patient exists.
    3. Insert into check_ins.
    4. Return a success message and the new check-in id.
    """
    patient_id_str = str(body.patient_id)

    # 1) Patient must already exist (foreign key target).
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

    # 2) Save the check-in row.
    try:
        created = save_check_in(patient_id_str, body.transcript)
    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=f"Could not save the check-in. Details: {exc}",
        ) from exc

    check_in_id = created.get("id")
    if not check_in_id:
        raise HTTPException(
            status_code=500,
            detail="Check-in was saved but no id was returned by Supabase.",
        )

    return CheckInCreateResponse(
        message="Check-in saved successfully.",
        check_in_id=check_in_id,
    )


@router.get("/{patient_id}")
async def list_check_ins_for_patient(patient_id: UUID):
    """
    Return previous check-ins for one patient (newest first).
    """
    patient_id_str = str(patient_id)

    # Confirm the patient exists so callers get a clear 404
    # instead of an empty list for a typo'ed id.
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
        check_ins = get_check_ins_for_patient(patient_id_str)
    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=f"Could not load check-ins. Details: {exc}",
        ) from exc

    return {
        "message": "Check-ins retrieved successfully.",
        "patient_id": patient_id_str,
        "count": len(check_ins),
        "check_ins": check_ins,
    }
