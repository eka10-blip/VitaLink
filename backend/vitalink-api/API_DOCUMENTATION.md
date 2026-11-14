# VitaLink Backend API Documentation

Guide for **Person 4 (frontend / family dashboard)** integrating with the VitaLink FastAPI backend.

**Important safety notes for the UI**

- Vital measurements are **not clinically validated**.
- Health reports are **administrative caregiver summaries**, **not medical diagnoses**.
- `needs_human_review` is an **administrative flag** for caregiver attention.
  - `true` does **not** diagnose.
  - `false` does **not** mean the patient is medically safe.

---

## 1. Getting started

### Base URL (local)

```text
http://127.0.0.1:8000
```

### Start the FastAPI server

From the project root (`VitaLink-Backend`):

```bash
uvicorn app.main:app --reload
```

Then open:

| Resource | URL |
|---|---|
| Swagger UI (interactive docs) | http://127.0.0.1:8000/docs |
| ReDoc | http://127.0.0.1:8000/redoc |
| OpenAPI JSON | http://127.0.0.1:8000/openapi.json |

### Auth & CORS

- No authentication tokens are required yet.
- CORS is currently open (`allow_origins=["*"]`) for teammate demos.
- Send JSON bodies with `Content-Type: application/json`.

### Demo patient (fictional test data)

These IDs exist in the shared demo Supabase project and were used to verify this documentation:

| Field | Demo value |
|---|---|
| Patient name | John Smith |
| `patient_id` | `666bdf72-866f-437a-a3b5-f14e21899582` |
| Example `check_in_id` | `9c94ab6d-a229-45ab-940e-0ee900a6a446` |

Always prefer IDs returned by the API (`POST /check-ins`, list endpoints) over hardcoding.

---

## 2. ID relationships

```text
patients.id
   │
   ├── care_plans.patient_id
   ├── check_ins.patient_id
   │      │
   │      ├── vitals.check_in_id  (+ vitals.patient_id must match)
   │      └── health_reports.check_in_id
   │
   └── health_reports.patient_id
```

Rules enforced by the API:

1. `patient_id` must refer to an existing patient.
2. `check_in_id` must refer to an existing check-in.
3. For `POST /vitals` and `POST /health-reports`, the check-in **must belong to** the given patient (`check_ins.patient_id == patient_id`). Otherwise the API returns **400**.

---

## 3. Recommended frontend workflow

```text
1. GET  /patients/{patient_id}          → load profile
2. GET  /care-plans/{patient_id}        → load care plan (optional for display)
3. POST /check-ins                      → save transcript → receive check_in_id
4. POST /vitals                         → optional; when measurements exist
5. POST /health-reports                 → generate + save report (uses Gemini; may take a few seconds)
6. GET  /reports/patient/{patient_id}   → dashboard list (newest first)
7. GET  /reports/{report_id}            → report detail page
```

Typical create flow after a live check-in session:

1. **Save check-in** with `patient_id` + `transcript` → store returned `check_in_id`.
2. **Save vitals** (when available) with the same `patient_id` + that `check_in_id` + `measurement_source`.
3. **Generate health report** with the same `patient_id` + `check_in_id`.
4. **Retrieve reports** for the dashboard list/detail views.

---

## 4. `measurement_source`

Used by `POST /vitals` (request) and returned on saved vitals / inside health-report `vital_measurements`.

| Value | Meaning | Frontend guidance |
|---|---|---|
| `manual` | Entered for testing/demo | Label as **manual / test data**. Never call this camera-estimated. |
| `camera_estimated` | Produced by the camera pipeline | Label as **camera-estimated**. Still **not clinically validated**. |
| `unspecified` | Source was not recorded (e.g. older rows) | Label as **source unknown**. Do **not** assume camera-estimated. |

Allowed request values for `POST /vitals` are only:

- `manual`
- `camera_estimated`

`unspecified` appears in **read/report** data when a stored row has no source; it is not accepted on create.

Every report vital value also includes:

```json
"clinically_validated": false
```

---

## 5. `needs_human_review`

Boolean on health reports.

| Value | Meaning for the UI |
|---|---|
| `true` | Show a clear **“Needs caregiver review”** badge. A human should look at the report. |
| `false` | No administrative review trigger matched. **Do not** display this as “patient is safe” or “no medical attention needed.” |

Suggested UI copy when `true`:

> Needs caregiver review

Suggested UI copy when `false`:

> No administrative review flag
> (This is not a medical clearance.)

Reports also include:

- `report.review_rationale` — administrative explanation
- `report.review_flag_definition` — short definition of the flag

---

## 6. Endpoints

### 6.1 `GET /patients/{patient_id}`

**Purpose:** Load one patient’s profile for the dashboard header.

| | |
|---|---|
| Method | `GET` |
| URL | `/patients/{patient_id}` |
| Path params | `patient_id` (UUID) — required |
| Body | none |

**Example request**

```http
GET /patients/666bdf72-866f-437a-a3b5-f14e21899582
```

**Example success — `200`**

```json
{
  "message": "Patient retrieved successfully.",
  "patient": {
    "id": "666bdf72-866f-437a-a3b5-f14e21899582",
    "name": "John Smith",
    "age": 75,
    "medical_history": "History of high blood pressure",
    "created_at": "2026-11-14T18:00:00.372760Z"
  }
}
```

**Error codes**

| Code | Meaning |
|---|---|
| `422` | `patient_id` is not a valid UUID |
| `404` | Patient does not exist |
| `503` | Database unreachable while looking up the patient |

---

### 6.2 `GET /care-plans/{patient_id}`

**Purpose:** Load the patient’s most recent care plan.

| | |
|---|---|
| Method | `GET` |
| URL | `/care-plans/{patient_id}` |
| Path params | `patient_id` (UUID) — required |
| Body | none |

**Example request**

```http
GET /care-plans/666bdf72-866f-437a-a3b5-f14e21899582
```

**Example success — `200`**

```json
{
  "message": "Care plan retrieved successfully.",
  "patient_id": "666bdf72-866f-437a-a3b5-f14e21899582",
  "care_plan": {
    "id": "3b4d699f-eb96-4bea-86ae-7e1024778354",
    "patient_id": "666bdf72-866f-437a-a3b5-f14e21899582",
    "instructions": "Check in daily about dizziness, sleep quality, and general well-being.",
    "health_concerns": [
      "Dizziness",
      "Sleep monitoring"
    ],
    "created_at": "2026-11-14T19:59:03.483564Z"
  }
}
```

**Error codes**

| Code | Meaning |
|---|---|
| `422` | Invalid UUID |
| `404` | Patient does not exist, **or** patient exists but has no care plan |
| `500` | Failed to load care plan |
| `503` | Database unreachable while looking up the patient |

---

### 6.3 `POST /check-ins`

**Purpose:** Save a new check-in transcript for an existing patient.

| | |
|---|---|
| Method | `POST` |
| URL | `/check-ins` |
| Path params | none |
| Body | JSON (required) |

**Request body**

| Field | Type | Required | Notes |
|---|---|---|---|
| `patient_id` | UUID string | yes | Must exist in `patients` |
| `transcript` | string | yes | Non-empty after trimming whitespace |

**Example request**

```json
{
  "patient_id": "666bdf72-866f-437a-a3b5-f14e21899582",
  "transcript": "Demo transcript for API docs verification."
}
```

**Example success — `200`**

```json
{
  "message": "Check-in saved successfully.",
  "check_in_id": "fb2d6b6d-b4d7-43e4-94a0-3190d716b7b1"
}
```

**Error codes**

| Code | Meaning |
|---|---|
| `422` | Missing fields, invalid UUID, or blank/whitespace-only transcript |
| `404` | Patient does not exist |
| `500` | Insert failed / no id returned |
| `503` | Database unreachable while looking up the patient |

---

### 6.4 `GET /check-ins/{patient_id}`

**Purpose:** List previous check-ins for a patient (newest first).

| | |
|---|---|
| Method | `GET` |
| URL | `/check-ins/{patient_id}` |
| Path params | `patient_id` (UUID) — required |
| Body | none |

**Example request**

```http
GET /check-ins/666bdf72-866f-437a-a3b5-f14e21899582
```

**Example success — `200`**

```json
{
  "message": "Check-ins retrieved successfully.",
  "patient_id": "666bdf72-866f-437a-a3b5-f14e21899582",
  "count": 2,
  "check_ins": [
    {
      "id": "bfe0dcf9-ace8-478a-9057-32f42f977996",
      "patient_id": "666bdf72-866f-437a-a3b5-f14e21899582",
      "transcript": "Patient said they slept well and feel less dizzy today.",
      "occurred_at": "2026-11-14T19:40:01.012082+00:00"
    },
    {
      "id": "9c94ab6d-a229-45ab-940e-0ee900a6a446",
      "patient_id": "666bdf72-866f-437a-a3b5-f14e21899582",
      "transcript": "Patient said they slept well and feel less dizzy today.",
      "occurred_at": "2026-11-14T19:28:28.204794+00:00"
    }
  ]
}
```

Each check-in object includes: `id`, `patient_id`, `transcript`, `occurred_at`.

**Error codes**

| Code | Meaning |
|---|---|
| `422` | Invalid UUID |
| `404` | Patient does not exist |
| `500` | Failed to load check-ins |
| `503` | Database unreachable |

---

### 6.5 `POST /vitals`

**Purpose:** Save heart rate and breathing rate for a patient check-in, with a required measurement source label.

| | |
|---|---|
| Method | `POST` |
| URL | `/vitals` |
| Path params | none |
| Body | JSON (required) |

**Request body**

| Field | Type | Required | Notes |
|---|---|---|---|
| `patient_id` | UUID | yes | Must exist |
| `check_in_id` | UUID | yes | Must exist and belong to that patient |
| `heart_rate` | number | yes | Must be `> 0`. Not clinically validated. |
| `breathing_rate` | number | yes | Must be `> 0`. Not clinically validated. |
| `measurement_source` | string enum | yes | `"manual"` or `"camera_estimated"` only |

**Example request**

```json
{
  "patient_id": "666bdf72-866f-437a-a3b5-f14e21899582",
  "check_in_id": "fb2d6b6d-b4d7-43e4-94a0-3190d716b7b1",
  "heart_rate": 72,
  "breathing_rate": 16,
  "measurement_source": "manual"
}
```

**Example success — `200`**

```json
{
  "message": "Vitals saved successfully.",
  "note": "These measurements are not clinically validated and are not a medical diagnosis. Source label: manual.",
  "vitals_id": "46c4d647-4d5e-4ffc-afeb-0b451214ccea",
  "vitals": {
    "id": "46c4d647-4d5e-4ffc-afeb-0b451214ccea",
    "patient_id": "666bdf72-866f-437a-a3b5-f14e21899582",
    "check_in_id": "fb2d6b6d-b4d7-43e4-94a0-3190d716b7b1",
    "heart_rate": 72.0,
    "breathing_rate": 16.0,
    "measurement_source": "manual",
    "measured_at": "2026-11-14T20:20:17.215687Z"
  }
}
```

**Error codes**

| Code | Meaning |
|---|---|
| `422` | Invalid/missing fields, invalid UUID, non-positive rates, or invalid `measurement_source` |
| `404` | Patient or check-in does not exist |
| `400` | Check-in exists but does not belong to the given patient |
| `500` | Insert failed (also if `measurement_source` column is missing in Supabase) |
| `503` | Database unreachable |

---

### 6.6 `POST /health-reports`

**Purpose:** Generate an AI-assisted administrative health report for one check-in, save it, and return it.

Uses the patient’s record, latest care plan (if any), the check-in transcript, and any vitals linked to that check-in. Calls Gemini. May take a few seconds.

| | |
|---|---|
| Method | `POST` |
| URL | `/health-reports` |
| Path params | none |
| Body | JSON (required) |

**Request body**

| Field | Type | Required | Notes |
|---|---|---|---|
| `patient_id` | UUID | yes | Must exist |
| `check_in_id` | UUID | yes | Must exist and belong to that patient |

**Example request**

```json
{
  "patient_id": "666bdf72-866f-437a-a3b5-f14e21899582",
  "check_in_id": "9c94ab6d-a229-45ab-940e-0ee900a6a446"
}
```

**Example success — `200`**

Top-level response model fields:

```json
{
  "message": "Health report generated and saved successfully.",
  "health_report_id": "292abccb-ea11-456b-91ce-8277269ee38d",
  "summary": "During the check-in, the patient reported sleeping well and feeling less dizzy today. Two sets of vital measurements were recorded for this check-in.",
  "needs_human_review": true,
  "report": {
    "patient_reported_symptoms_or_concerns": [
      "Patient stated they slept well and feel less dizzy today."
    ],
    "vital_measurements": {
      "available": true,
      "values": [
        {
          "heart_rate": 70.0,
          "breathing_rate": 15.0,
          "measurement_source": "manual",
          "clinically_validated": false
        },
        {
          "heart_rate": 72.0,
          "breathing_rate": 16.0,
          "measurement_source": "unspecified",
          "clinically_validated": false
        }
      ]
    },
    "care_plan_follow_up_reminders": [
      "Check in daily about dizziness, sleep quality, and general well-being."
    ],
    "information_gaps": [],
    "review_rationale": "Administrative review recommended for the following reason(s), based only on available information (not a diagnosis or clinical judgment): ...",
    "review_flag_definition": "needs_human_review is an administrative caregiver-review flag only. True does not diagnose. False does not mean the patient is medically safe."
  }
}
```

Notes for frontend:

- Treat `report` as a JSON object. Nested keys above are the current generator shape; always rely on top-level `summary` and `needs_human_review` for list cards.
- Missing care plan or vitals is allowed; the report will note gaps instead of inventing data.
- Do not present the summary as a clinical conclusion.

**Error codes**

| Code | Meaning |
|---|---|
| `422` | Invalid/missing UUIDs |
| `404` | Patient or check-in not found |
| `400` | Check-in does not belong to the patient |
| `503` | Database unreachable while loading patient/check-in/care plan/vitals |
| `502` | Gemini generation/parsing failed |
| `500` | Report generated but saving to Supabase failed |

---

### 6.7 `GET /reports/patient/{patient_id}`

**Purpose:** Dashboard list of all health reports for a patient (newest first).

| | |
|---|---|
| Method | `GET` |
| URL | `/reports/patient/{patient_id}` |
| Path params | `patient_id` (UUID) — required |
| Body | none |

**Example request**

```http
GET /reports/patient/666bdf72-866f-437a-a3b5-f14e21899582
```

**Example success — `200`**

```json
{
  "message": "Health reports retrieved successfully.",
  "patient_id": "666bdf72-866f-437a-a3b5-f14e21899582",
  "count": 7,
  "reports": [
    {
      "id": "292abccb-ea11-456b-91ce-8277269ee38d",
      "patient_id": "666bdf72-866f-437a-a3b5-f14e21899582",
      "check_in_id": "9c94ab6d-a229-45ab-940e-0ee900a6a446",
      "summary": "During the check-in, the patient reported sleeping well and feeling less dizzy today. Two sets of vital measurements were recorded for this check-in.",
      "needs_human_review": true,
      "created_at": "2026-11-14T20:17:45.833125Z",
      "report": {
        "patient_reported_symptoms_or_concerns": ["..."],
        "vital_measurements": { "available": true, "values": [] },
        "care_plan_follow_up_reminders": ["..."],
        "information_gaps": [],
        "review_rationale": "...",
        "review_flag_definition": "..."
      }
    }
  ]
}
```

Each report item includes: `id`, `patient_id`, `check_in_id`, `summary`, `report`, `needs_human_review`, `created_at`.

**Error codes**

| Code | Meaning |
|---|---|
| `422` | Invalid UUID |
| `404` | Patient does not exist |
| `500` | Failed to load reports |
| `503` | Database unreachable |

---

### 6.8 `GET /reports/{report_id}`

**Purpose:** Load one saved health report for a detail page.

| | |
|---|---|
| Method | `GET` |
| URL | `/reports/{report_id}` |
| Path params | `report_id` (UUID) — required |
| Body | none |

**Example request**

```http
GET /reports/292abccb-ea11-456b-91ce-8277269ee38d
```

**Example success — `200`**

```json
{
  "message": "Health report retrieved successfully.",
  "report": {
    "id": "292abccb-ea11-456b-91ce-8277269ee38d",
    "patient_id": "666bdf72-866f-437a-a3b5-f14e21899582",
    "check_in_id": "9c94ab6d-a229-45ab-940e-0ee900a6a446",
    "summary": "During the check-in, the patient reported sleeping well and feeling less dizzy today. Two sets of vital measurements were recorded for this check-in.",
    "needs_human_review": true,
    "created_at": "2026-11-14T20:17:45.833125Z",
    "report": {
      "patient_reported_symptoms_or_concerns": [
        "Patient stated they slept well and feel less dizzy today."
      ],
      "vital_measurements": {
        "available": true,
        "values": [
          {
            "heart_rate": 70.0,
            "breathing_rate": 15.0,
            "measurement_source": "manual",
            "clinically_validated": false
          }
        ]
      },
      "care_plan_follow_up_reminders": [
        "Check in daily about dizziness, sleep quality, and general well-being."
      ],
      "information_gaps": [],
      "review_rationale": "Administrative review recommended ...",
      "review_flag_definition": "needs_human_review is an administrative caregiver-review flag only. True does not diagnose. False does not mean the patient is medically safe."
    }
  }
}
```

**Error codes**

| Code | Meaning |
|---|---|
| `422` | Invalid UUID |
| `404` | Report does not exist |
| `503` | Database unreachable |

---

## 7. Quick reference

| Method | Endpoint | Ready for Person 4? |
|---|---|---|
| `GET` | `/patients/{patient_id}` | Yes |
| `GET` | `/care-plans/{patient_id}` | Yes |
| `POST` | `/check-ins` | Yes |
| `GET` | `/check-ins/{patient_id}` | Yes |
| `POST` | `/vitals` | Yes |
| `POST` | `/health-reports` | Yes |
| `GET` | `/reports/patient/{patient_id}` | Yes |
| `GET` | `/reports/{report_id}` | Yes |

---

## 8. Available now vs not implemented yet

### Available (documented above)

All eight product endpoints listed in section 6.

### Also present (ops / debug — usually not for dashboard UI)

| Method | URL | Notes |
|---|---|---|
| `GET` | `/` | Service alive check |
| `GET` | `/health` | Readiness |
| `GET` | `/supabase-test` | Connectivity check (HTML or `?format=json`) |
| `GET` | `/gemini-test` | Gemini connectivity check (HTML or `?format=json`) |

### Not implemented yet (do not depend on these for the dashboard)

| Feature | Status |
|---|---|
| `GET /patients` (list all patients) | Not implemented |
| `GET /vitals` or vitals-by-check-in read API | Not implemented (vitals are created via `POST /vitals` and appear inside health reports) |
| `GET /check-ins/detail/{check_in_id}` (single check-in by id) | Not implemented (use list-by-patient) |
| Auth / roles (patient vs family vs caregiver) | Not implemented |
| Updating or deleting reports/check-ins/vitals | Not implemented |
| Creating/updating patients or care plans via API | Not implemented (seeded in Supabase for demos) |

---

## 9. Common error response shape

FastAPI errors typically look like:

```json
{
  "detail": "No patient found with id '00000000-0000-0000-0000-000000000000'. Double-check the patient_id and try again."
}
```

Validation errors (`422`) use a list under `detail` with field locations.

API keys and secrets are never returned in responses.

---

## 10. Swagger testing checklist for Person 4

1. Start the server: `uvicorn app.main:app --reload`
2. Open http://127.0.0.1:8000/docs
3. `GET /patients/{patient_id}` with the demo patient id
4. `GET /care-plans/{patient_id}`
5. `POST /check-ins` → copy `check_in_id`
6. `POST /vitals` with that `check_in_id` and `"measurement_source": "manual"`
7. `POST /health-reports` with the same ids → wait for Gemini
8. `GET /reports/patient/{patient_id}` → copy a report `id`
9. `GET /reports/{report_id}`

If any step fails, check the `detail` message and status code tables above.
