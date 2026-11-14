# VitaLink Person 1 — Team Handoff (2026-11-14)

Owner: FaceTime AI caregiver agent (Chert + LiveKit + Gemini + ElevenLabs Katie).
Project path: `backend/agent/`

## Working vs pending

| Item | Status |
| --- | --- |
| Offline unit tests (connection, transcripts, session store) | **PASS** |
| LiveKit credentials accepted by `chert doctor` | **Working** (local `.env.local`) |
| Gemini `gemini-3.5-flash-lite` generateContent | **Working** (offline API test) |
| ElevenLabs TTS model `eleven_turbo_v2_5` | **Working** once voice is in My Voices |
| MVP voice Sarah `EXAVITQu4vr4xnSDxMaL` | **Working** Gemini→TTS (Katie needs paid plan; deferred) |
| Session / vitals / caregiver-report HTTP API | **Working** locally (`api_server.py`) |
| Patient context injection into agent instructions | **Working** (`PUT /v1/patient-context`) |
| Chert CLI setup + doctor | **Working**; line Mac may warn during hosted demo queue |
| Hosted Chert demo FaceTime | **Pending** (user onboarding Terminal separate) |
| Custom FaceTime two-way audio (`chert_worker` + `chert dev`) | **Pending / NOT VERIFIED** |
| Conversation mode on a live FaceTime call | **Pending** (set `VITALINK_MODE=conversation` after probe) |
| Presage live video vitals | **Pending** (API slot ready; no Presage SDK here) |

## Environment variables

Copy `.env.example` → `.env.local` (chmod 600). Never commit `.env` / `.env.local`.

| Variable | Required for | Notes |
| --- | --- | --- |
| `LIVEKIT_URL` | probe + conversation | Your LiveKit Cloud project |
| `LIVEKIT_API_KEY` | probe + conversation | Same project |
| `LIVEKIT_API_SECRET` | probe + conversation | Same project |
| `AGENT_NAME` | Chert dispatch | Default `vitalink-caregiver` |
| `VITALINK_MODE` | runtime | `probe` (beeps) or `conversation` (Gemini+ElevenLabs) |
| `GOOGLE_API_KEY` | conversation | Gemini |
| `ELEVEN_API_KEY` | conversation | STT + TTS |
| `ELEVEN_VOICE_ID` | conversation | Katie `kfGEdprt9Oe4pbdP8VTo` |
| `GEMINI_MODEL` | conversation | `gemini-3.5-flash-lite` |
| `ELEVEN_TTS_MODEL` | conversation | `eleven_turbo_v2_5` |
| `PATIENT_ID` | handoff JSON | Default `synthetic-demo-patient` |

`.env.local` overrides `.env` (see `config.py`).

## Startup commands

```bash
cd backend/agent
python3.12 -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements.lock.txt
cp .env.example .env.local && chmod 600 .env.local
# fill secrets locally

# Teammate HTTP API (frontend / Presage)
python api_server.py
# → http://127.0.0.1:8787

# Offline tests
python -m unittest -v
```

### FaceTime agent (after Chert onboarding demo ends)

Terminal A:
```bash
cd backend/agent && source .venv/bin/activate
# first call: keep probe. later: export VITALINK_MODE=conversation
python chert_worker.py dev
```

Terminal B:
```bash
cd backend/agent
export PATH="$PWD/.local/tools/node-v22.22.0-darwin-arm64/bin:$PATH"
npx --yes --prefer-online @trychert/facetime@0.1.0-beta.21 setup \
  --env-file .env.local --project 7dbccbe1-7919-4ac1-a7e2-1fc1cdd0282f
npx --yes --prefer-online @trychert/facetime@0.1.0-beta.21 doctor
npx --yes --prefer-online @trychert/facetime@0.1.0-beta.21 dev --agent vitalink-caregiver
```

Then FaceTime the line number shown by `chert dev` / https://app.trychert.com/overview  
Chert project: **VitaLink** `7dbccbe1-7919-4ac1-a7e2-1fc1cdd0282f`.

## Teammate HTTP API

Base: `http://127.0.0.1:8787`

### Health
`GET /health` → `{"ok": true, "service": "vitalink-agent-api"}`

### List sessions
`GET /v1/sessions` → `{"sessions":[...handoff.json objects...]}`

### Session handoff
`GET /v1/sessions/{session_id}`

Example response fields:
```json
{
  "schema_version": 1,
  "session_id": "uuid",
  "patient_id": "synthetic-demo-patient",
  "room_name": "...",
  "agent_identity": "...",
  "connector_identity": "chert-bridge-...",
  "status": "stopped",
  "turn_count": 3,
  "presage": {"status": "not_connected", "measurements": null},
  "caregiver_report": null,
  "transcript_file": "transcript.jsonl"
}
```

### Transcript
`GET /v1/sessions/{session_id}/transcript`
```json
{
  "session_id": "uuid",
  "turns": [
    {"role": "user", "text": "...", "sequence": 1, "interrupted": false}
  ]
}
```

### Vitals (Presage teammate writes)
`PUT /v1/sessions/{session_id}/vitals`
```json
{
  "status": "received",
  "source": "presage",
  "measurements": {"hr_bpm": 72, "rr_bpm": 16, "note": "synthetic"}
}
```
`GET /v1/sessions/{session_id}/vitals` → current `presage` object.

### Caregiver report
`PUT /v1/sessions/{session_id}/caregiver-report`
```json
{
  "summary": "Synthetic check-in complete",
  "highlights": ["patient reported tiredness"],
  "family_instructions": "Call back this evening"
}
```
`GET /v1/sessions/{session_id}/caregiver-report`

### Patient context (backend teammate → agent)
`PUT /v1/patient-context`
```json
{
  "patient_id": "synthetic-demo-patient",
  "history": [{"condition": "demo hypertension"}],
  "previous_checkins": [{"mood": "ok", "at": "2026-11-13T18:00:00Z"}],
  "family_care_instructions": "Encourage hydration; ask about sleep."
}
```
`GET /v1/patient-context`

On call start (conversation mode), the agent appends this context to system instructions.

## Files for teammates

| File | Purpose |
| --- | --- |
| `chert_worker.py` | Managed Chert LiveKit agent (`probe` / `conversation`) |
| `agent.py` | Gemini + ElevenLabs session builder + direct-room fallback |
| `api_server.py` | Session / vitals / report / context HTTP API |
| `session_store.py` | Filesystem store under `sessions/` |
| `transcripts.py` | Durable `handoff.json` + `transcript.jsonl` |
| `PRESAGE_HANDOFF.md` | Video/vitals contract notes |
| `.env.example` | Safe template (no secrets) |

## Katie voice (required before conversation TTS)

1. Open https://elevenlabs.io/app/voice-library  
2. Search **Katie - IVR & Customer Service** (ID `kfGEdprt9Oe4pbdP8VTo`)  
3. Add to **My Voices**  
4. Keep `ELEVEN_VOICE_ID=kfGEdprt9Oe4pbdP8VTo` in `.env.local`

## GitHub push (safe)

From repo root (`VitaLink`). Do **not** add `.env.local`, `.venv`, `.local`, `sessions/`.

```bash
cd /Users/krishnapunnavajhala/Documents/Codex/2026-11-14/VitaLink
git init
git add .gitignore backend/agent
git status   # confirm no .env.local / .venv / secrets
git commit -m "$(cat <<'EOF'
Add VitaLink FaceTime caregiver agent and teammate session API.

EOF
)"
# after remote exists:
git remote add origin git@github.com:<TEAM_ORG>/<TEAM_REPO>.git
git branch -M main
git push -u origin main
```

If the team repo already exists, copy/push only `backend/agent` into their tree and open a PR.

## Notes

- Synthetic patient data only. No diagnosis / fall detection.
- Do not claim FaceTime works until a live call is verified.
- OPENAI key warnings from `chert doctor` are irrelevant (we use Gemini + ElevenLabs).
