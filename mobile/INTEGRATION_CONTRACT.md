# VitaLink API handoff — proposed, not verified

This is a request to Person 3 for a minimal stable contract. **The existing backend endpoints were not available for inspection.** The team must confirm field names, routes, and auth before switching from demo mode.

## Authentication and authorization

- Supabase Auth or team-approved identity provider issues a user-scoped bearer token.
- App calls API with `Authorization: Bearer <session access token>`; never use service-role credentials in a mobile binary.
- Backend authorizes every request with user claims and a patient–caregiver link (RLS where applicable).
- Never accept an arbitrary patient ID supplied by a client unless validated against ownership/sharing.
- A caregiver should receive only the approved fields explicitly shared by the patient.

## Proposed routes used in src/liveRepository.ts

| Method | Route | Output |
|---|---|---|
| GET | `/v1/me` | `{"role":"patient"}` or `{"role":"caregiver"}` based on signed-in user |
| GET | `/v1/patient/dashboard` | `Dashboard` JSON for authenticated patient |
| GET | `/v1/caregiver/dashboard` | `Dashboard` JSON for authenticated caregiver's authorized linked patient |
| POST | `/v1/checkins/start` | 204 or status response; triggers Person 1 / Person 2 session if server supports it |
| PATCH | `/v1/alerts/:id/acknowledge` | 204 or status response after authorization check |

**Role switch:** Hidden in live mode, where the backend/session must determine role. The frontend fetches the signed-in role from `GET /v1/me`; it will not show live data until the role is verified. Add a proper sign-in screen before using real records.

## Proposed dashboard JSON

```json
{
  "patientId": "authorized-patient-id",
  "patientName": "Example Patient",
  "caregiverName": "Example Caregiver",
  "lastUpdated": "2026-11-14T15:00:00Z",
  "linked": true,
  "pulse": { "value": 72, "unit": "bpm", "source": "presage", "quality": "good", "measuredAt": "2026-11-14T15:00:00Z" },
  "breathing": { "value": 16, "unit": "breaths/min", "source": "presage", "quality": "good", "measuredAt": "2026-11-14T15:00:00Z" },
  "checkIns": [{ "id": "c123", "timestamp": "2026-11-14T15:01:00Z", "state": "completed", "note": "Reported feeling well", "pulse": 72, "breathing": 16 }],
  "alerts": [{ "id": "a1", "createdAt": "2026-11-14T15:02:00Z", "kind": "unanswered-check-in", "title": "Follow-up needed", "detail": "A scheduled check-in was unanswered", "acknowledged": false, "simulated": false }],
  "report": { "createdAt": "2026-11-14T15:03:00Z", "patientSummary": "Patient-friendly summary from Gemini", "caregiverSummary": "Caregiver-facing summary from Gemini" }
}
```

If signal quality is poor or measurement missing, use `value: null, quality: "unavailable", measuredAt: null` instead of fabricating a number.

## Integration messages to teammates

- **Person 1:** Please store completed voice check-in transcripts and user responses as timestamped records, with consent; the frontend only needs structured `note`, `state`, and summary fields. Use an actual session link/ID for an optional later live call screen.
- **Person 2:** Please expose latest pulse/breathing readings with timestamps, values or null, source and quality. Do not provide an invented estimate when camera quality fails.
- **Person 3:** Please provide patient/caregiver protected dashboard routes, report summaries, caregiver authorization, alert acknowledgement, and a secure way for Person 4's frontend to obtain a session access token.

## Notification design

Poll every 15 seconds for demo. For production, use authenticated Supabase Realtime subscriptions and device push notifications with proper access control and consent. The hackathon UI **does not send emergency alerts** outside the app.
