"""
Health report generation for VitaLink Backend.

Takes patient context (history, care plan, transcript, vitals),
builds a prompt for Gemini, and returns a structured JSON health report.

Safety notes:
- Reports are administrative caregiver summaries, not clinical assessments.
- needs_human_review is an administrative flag only — never a medical
  clearance or statement that the patient is safe.
"""

import json
import re
from typing import Any

from app.gemini_client import generate_text

# Phrases that sound like medical reassurance / clinical clearance.
# We strip or rewrite these if the model produces them anyway.
_REASSURANCE_PATTERNS = [
    re.compile(p, re.IGNORECASE)
    for p in [
        r"\bno acute concerns?\b",
        r"\bno immediate (?:clinical )?escalation(?: is needed)?\b",
        r"\b(?:the )?patient is medically stable\b",
        r"\bmedically stable\b",
        r"\bno medical concerns?\b",
        r"\bno (?:immediate )?medical (?:attention|concerns?|issues?)\b",
        r"\b(?:appears?|seems?|is) (?:clinically |medically )?safe\b",
        r"\bno (?:signs?|indication) of (?:medical )?concern\b",
        r"\bmeasurements? indicate (?:no|that there (?:are|is) no)\b",
        r"\bdoes not (?:appear to )?require (?:medical|clinical) (?:attention|escalation)\b",
        r"\bwithin normal limits\b",
        r"\bvitals? (?:are|look|appear) normal\b",
        r"\bno cause for (?:medical )?concern\b",
    ]
]

# ---------------------------------------------------------------------------
# Administrative criteria for needs_human_review
#
# This flag means: "a human caregiver should look at this report."
# It does NOT mean: "the patient is/isn't medically safe."
#
# Set needs_human_review = True when ANY of these are true:
#   1. Care plan is missing
#   2. Vitals are missing for the check-in
#   3. Any vital has measurement_source "unspecified" or "manual"
#      (quality/source uncertainty for caregivers)
#   4. Transcript / history mentions a concern topic caregivers track
#      (e.g. dizziness, pain, fall, shortness of breath) — even if
#      the patient says it improved
#   5. Gemini listed information_gaps
#   6. Gemini's needs_human_review was missing/invalid
#   7. There is not enough information to decide — default to True
#
# needs_human_review = False is only allowed when NONE of the above
# apply. Even then, review_rationale must state that False is
# administrative only and does NOT mean the patient is medically safe.
# ---------------------------------------------------------------------------

_CONCERN_KEYWORDS = [
    "dizzy",
    "dizziness",
    "vertigo",
    "fall",
    "fell",
    "pain",
    "chest",
    "breath",
    "shortness",
    "nausea",
    "vomit",
    "confused",
    "confusion",
    "weak",
    "faint",
    "bleeding",
    "swelling",
    "fever",
]


def _vital_source_label(row: dict[str, Any]) -> str:
    """Map a vitals row to manual / camera_estimated / unspecified."""
    source = (row.get("measurement_source") or "").strip()
    if source == "camera_estimated":
        return "camera_estimated"
    if source == "manual":
        return "manual"
    return "unspecified"


def _text_mentions_concern(text: str | None) -> bool:
    """Return True if text mentions a caregiver-tracked concern topic."""
    if not text:
        return False
    lowered = text.lower()
    return any(word in lowered for word in _CONCERN_KEYWORDS)


def _contains_reassurance(text: str) -> bool:
    return any(pattern.search(text) for pattern in _REASSURANCE_PATTERNS)


def _scrub_reassurance(text: str) -> str:
    """
    Remove unsupported medical-reassurance phrases from model text.

    Keeps the rest of the sentence structure as intact as practical.
    """
    cleaned = text
    for pattern in _REASSURANCE_PATTERNS:
        cleaned = pattern.sub("[unsupported medical reassurance removed]", cleaned)
    # Tidy doubled spaces / empty leftover clauses a bit.
    cleaned = re.sub(r"\s{2,}", " ", cleaned).strip()
    return cleaned


def _administrative_review_triggers(
    care_plan: dict[str, Any] | None,
    check_in: dict[str, Any],
    vitals: list[dict[str, Any]],
    report: dict[str, Any],
) -> list[str]:
    """
    Return human-readable reasons to set needs_human_review=True.

    Based only on available administrative information — not diagnoses.
    """
    triggers: list[str] = []

    if care_plan is None:
        triggers.append("No care plan is on file for this patient.")

    if not vitals:
        triggers.append("No vital measurements are linked to this check-in.")
    else:
        sources = {_vital_source_label(row) for row in vitals}
        if "unspecified" in sources:
            triggers.append(
                "At least one vital measurement has an unspecified source "
                "(not confirmed as camera-estimated)."
            )
        if "manual" in sources:
            triggers.append(
                "At least one vital measurement was manually entered "
                "(test/demo data, not camera-estimated)."
            )

    transcript = check_in.get("transcript") or ""
    if _text_mentions_concern(transcript):
        triggers.append(
            "The check-in transcript mentions a concern topic that should "
            "be brought to a caregiver's attention (administrative flag only; "
            "not a diagnosis)."
        )

    gaps = report.get("information_gaps")
    if isinstance(gaps, list) and any(str(g).strip() for g in gaps):
        triggers.append("The report lists information gaps.")
    elif gaps and not isinstance(gaps, list) and str(gaps).strip():
        triggers.append("The report lists information gaps.")

    symptoms = report.get("patient_reported_symptoms_or_concerns")
    if isinstance(symptoms, list):
        for item in symptoms:
            if _text_mentions_concern(str(item)):
                triggers.append(
                    "Patient-reported symptoms/concerns include a topic "
                    "that should be brought to a caregiver's attention."
                )
                break

    return triggers


def build_prompt(
    patient: dict[str, Any],
    care_plan: dict[str, Any] | None,
    check_in: dict[str, Any],
    vitals: list[dict[str, Any]],
) -> str:
    """
    Build the Gemini prompt from all available patient information.

    Missing care plans or vitals are labeled as unavailable.
    The model is instructed NOT to invent data, diagnose, or reassure.
    """
    # Keep only useful, non-secret patient fields for the model.
    patient_for_prompt = {
        "id": patient.get("id"),
        "name": patient.get("name"),
        "age": patient.get("age"),
        "medical_history": patient.get("medical_history"),
    }

    if care_plan is None:
        care_plan_for_prompt: Any = "No care plan on file for this patient."
    else:
        care_plan_for_prompt = {
            "id": care_plan.get("id"),
            "instructions": care_plan.get("instructions"),
            "health_concerns": care_plan.get("health_concerns"),
            "created_at": care_plan.get("created_at"),
        }

    check_in_for_prompt = {
        "id": check_in.get("id"),
        "occurred_at": check_in.get("occurred_at"),
        "transcript": check_in.get("transcript"),
        "source_note": (
            "The transcript is patient-reported conversation text "
            "from the check-in (not a clinical measurement)."
        ),
    }

    if not vitals:
        vitals_for_prompt: Any = (
            "No vitals were recorded for this check-in. "
            "Do not invent heart rate or breathing rate values."
        )
    else:
        vitals_for_prompt = []
        for row in vitals:
            source_label = _vital_source_label(row)
            if source_label == "camera_estimated":
                source_note = (
                    "Camera-estimated vitals from the camera pipeline. "
                    "Not a medical-device reading and not clinically validated."
                )
            elif source_label == "manual":
                source_note = (
                    "Manually entered values for testing/demo. "
                    "NOT camera-estimated. Not clinically validated."
                )
            else:
                source_note = (
                    "Measurement source was not recorded. "
                    "Do NOT assume these are camera-estimated. "
                    "Not clinically validated."
                )

            vitals_for_prompt.append(
                {
                    "id": row.get("id"),
                    "heart_rate": row.get("heart_rate"),
                    "breathing_rate": row.get("breathing_rate"),
                    "measured_at": row.get("measured_at"),
                    "measurement_source": source_label,
                    "clinically_validated": False,
                    "source_note": source_note,
                }
            )

    prompt = f"""
You are writing an ADMINISTRATIVE caregiver summary for the VitaLink app.
You are NOT a clinician. This is NOT a medical assessment.

STRICT RULES:
1. Do NOT make a medical diagnosis or clinical judgment.
2. Do NOT recommend treatments, medications, dosages, or escalation decisions.
3. Do NOT invent missing information, symptoms, or measurements.
4. Do NOT give medical reassurance. Forbidden examples include (but are not limited to):
   - "there are no acute concerns"
   - "no immediate clinical escalation is needed"
   - "the patient is medically stable"
   - "the patient is safe"
   - "measurements indicate no medical concerns"
   - "vitals are normal" / "within normal limits"
5. Clearly distinguish:
   - Patient-reported information (transcript / medical history / care plan text)
   - Manually entered vitals (measurement_source = "manual") — never call these camera-estimated
   - Camera-estimated vitals (measurement_source = "camera_estimated") — not clinically validated
   - Unspecified-source vitals (measurement_source = "unspecified") — do NOT call these camera-estimated
6. For every vital value, set clinically_validated to false unless a clinical device
   validation is explicitly present in the input (it is not present in VitaLink data).
7. If something is missing, say it is unavailable. Never fill gaps with guesses.
8. needs_human_review is an ADMINISTRATIVE flag only:
   - true = a human caregiver should review this report
   - false must NEVER be used to imply the patient is medically safe or that
     no medical attention is needed
   - Prefer true when information is missing, unclear, contradictory, or the
     transcript mentions a concern topic caregivers track
   - If you cannot tell whether review is needed from the available information,
     set needs_human_review to true and say that clearly in review_rationale
9. review_rationale must:
   - Explain the administrative reason(s) using only available information
   - Avoid diagnoses and clinical judgments
   - If information is insufficient to decide, explicitly say so
10. Care-plan follow-up reminders must only come from the provided care plan.
    If there is no care plan, say no care-plan reminders are available.
11. summary must stay neutral and factual (who reported what; what data was/wasn't available).
    Do not interpret whether that is good or bad medically.

Return ONLY valid JSON (no markdown fences, no extra commentary) with this shape:
{{
  "summary": "A short neutral factual summary of this check-in (2-4 sentences).",
  "needs_human_review": true or false,
  "report": {{
    "patient_reported_symptoms_or_concerns": ["..."],
    "vital_measurements": {{
      "available": true or false,
      "values": [
        {{
          "heart_rate": null,
          "breathing_rate": null,
          "measurement_source": "manual" or "camera_estimated" or "unspecified",
          "clinically_validated": false
        }}
      ]
    }},
    "care_plan_follow_up_reminders": ["..."],
    "information_gaps": ["..."],
    "review_rationale": "Administrative explanation only — why a caregiver should or should not review, based on available information. No diagnoses."
  }}
}}

PATIENT RECORD:
{json.dumps(patient_for_prompt, indent=2, default=str)}

CARE PLAN:
{json.dumps(care_plan_for_prompt, indent=2, default=str)}

CHECK-IN (patient-reported transcript):
{json.dumps(check_in_for_prompt, indent=2, default=str)}

VITALS (use each row's measurement_source label exactly; clinically_validated is false):
{json.dumps(vitals_for_prompt, indent=2, default=str)}
""".strip()

    return prompt


def _extract_json_object(text: str) -> dict[str, Any]:
    """
    Parse a JSON object from Gemini's text reply.

    Handles plain JSON or JSON wrapped in ```json ... ``` fences.
    """
    cleaned = text.strip()

    # Strip common markdown code fences if the model adds them anyway.
    fence_match = re.search(r"```(?:json)?\s*([\s\S]*?)\s*```", cleaned)
    if fence_match:
        cleaned = fence_match.group(1).strip()

    try:
        data = json.loads(cleaned)
    except json.JSONDecodeError:
        # Last resort: grab the outermost { ... } block.
        start = cleaned.find("{")
        end = cleaned.rfind("}")
        if start == -1 or end == -1 or end <= start:
            raise ValueError("Gemini response did not contain a JSON object.")
        data = json.loads(cleaned[start : end + 1])

    if not isinstance(data, dict):
        raise ValueError("Gemini JSON response must be an object.")
    return data


def _normalize_vital_measurements(
    report: dict[str, Any],
    vitals: list[dict[str, Any]],
) -> dict[str, Any]:
    """
    Ensure vital_measurements keep source labels and clinically_validated=false.
    """
    block = report.get("vital_measurements")
    if not isinstance(block, dict):
        block = {}

    values = block.get("values")
    if not isinstance(values, list) or not values:
        # Fall back to the DB rows so we never invent numbers.
        values = []
        for row in vitals:
            values.append(
                {
                    "heart_rate": row.get("heart_rate"),
                    "breathing_rate": row.get("breathing_rate"),
                    "measurement_source": _vital_source_label(row),
                    "clinically_validated": False,
                }
            )

    normalized_values = []
    for item in values:
        if not isinstance(item, dict):
            continue
        source = item.get("measurement_source")
        if source not in ("manual", "camera_estimated", "unspecified"):
            source = "unspecified"
        normalized_values.append(
            {
                "heart_rate": item.get("heart_rate"),
                "breathing_rate": item.get("breathing_rate"),
                "measurement_source": source,
                "clinically_validated": False,
            }
        )

    report["vital_measurements"] = {
        "available": bool(normalized_values),
        "values": normalized_values,
    }
    return report


def _finalize_review_fields(
    care_plan: dict[str, Any] | None,
    check_in: dict[str, Any],
    vitals: list[dict[str, Any]],
    report: dict[str, Any],
    model_flag: Any,
) -> tuple[bool, dict[str, Any]]:
    """
    Apply conservative administrative criteria for needs_human_review
    and build a safe review_rationale.
    """
    triggers = _administrative_review_triggers(
        care_plan=care_plan,
        check_in=check_in,
        vitals=vitals,
        report=report,
    )

    model_said_true = model_flag is True
    model_flag_invalid = not isinstance(model_flag, bool)

    if model_flag_invalid:
        triggers.append(
            "The model did not return a clear boolean for needs_human_review; "
            "defaulted to true because there is insufficient clarity."
        )

    # Conservative OR: any administrative trigger wins.
    needs_human_review = bool(triggers) or model_said_true

    # If still false, document that this is administrative only.
    if needs_human_review:
        rationale = (
            "Administrative review recommended for the following reason(s), "
            "based only on available information (not a diagnosis or clinical "
            "judgment): "
            + " ".join(f"({i}) {reason}" for i, reason in enumerate(triggers, start=1))
        )
        if model_said_true and not triggers:
            rationale = (
                "Administrative review recommended based on the model's "
                "review flag. This is not a diagnosis or a statement about "
                "medical safety."
            )
    else:
        rationale = (
            "No administrative review triggers matched based on the available "
            "check-in fields. This does NOT mean the patient is medically safe, "
            "stable, or that no medical attention is needed — only that the "
            "structured administrative criteria did not fire."
        )

    # Prefer our administrative rationale; keep model text only as supplement
    # after scrubbing reassurance language.
    model_rationale = report.get("review_rationale")
    if isinstance(model_rationale, str) and model_rationale.strip():
        scrubbed = _scrub_reassurance(model_rationale.strip())
        if scrubbed and scrubbed != rationale:
            rationale = f"{rationale} Model note (scrubbed): {scrubbed}"

    report["review_rationale"] = rationale
    report["review_flag_definition"] = (
        "needs_human_review is an administrative caregiver-review flag only. "
        "True does not diagnose. False does not mean the patient is medically safe."
    )
    return needs_human_review, report


def generate_health_report(
    patient: dict[str, Any],
    care_plan: dict[str, Any] | None,
    check_in: dict[str, Any],
    vitals: list[dict[str, Any]],
) -> dict[str, Any]:
    """
    Generate a structured health report using Gemini.

    Returns a dict ready to store in health_reports:
    {
        "summary": "...",
        "report": { ... },
        "needs_human_review": true/false
    }

    needs_human_review is administrative only and is finalized with
    conservative criteria after the model responds.
    """
    prompt = build_prompt(
        patient=patient,
        care_plan=care_plan,
        check_in=check_in,
        vitals=vitals,
    )

    raw_text = generate_text(prompt)
    parsed = _extract_json_object(raw_text)

    summary = parsed.get("summary")
    if not isinstance(summary, str) or not summary.strip():
        raise ValueError("Gemini response was missing a usable 'summary' string.")
    summary = _scrub_reassurance(summary.strip())

    report = parsed.get("report")
    if not isinstance(report, dict):
        # If the model put details at the top level, keep them under report
        # except for the dedicated DB columns.
        report = {
            key: value
            for key, value in parsed.items()
            if key not in ("summary", "needs_human_review")
        }

    # Scrub reassurance from free-text list fields when present.
    for key in (
        "patient_reported_symptoms_or_concerns",
        "care_plan_follow_up_reminders",
        "information_gaps",
    ):
        value = report.get(key)
        if isinstance(value, list):
            report[key] = [
                _scrub_reassurance(str(item)) if isinstance(item, str) else item
                for item in value
            ]

    report = _normalize_vital_measurements(report, vitals)
    needs_human_review, report = _finalize_review_fields(
        care_plan=care_plan,
        check_in=check_in,
        vitals=vitals,
        report=report,
        model_flag=parsed.get("needs_human_review"),
    )

    # Final safety pass on summary/rationale.
    if _contains_reassurance(summary):
        summary = _scrub_reassurance(summary)
    rationale = str(report.get("review_rationale") or "")
    if _contains_reassurance(rationale):
        report["review_rationale"] = _scrub_reassurance(rationale)

    return {
        "summary": summary,
        "report": report,
        "needs_human_review": needs_human_review,
    }
