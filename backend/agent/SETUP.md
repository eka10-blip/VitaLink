# VitaLink setup

## Primary path: existing managed Chert project

Use only project `7dbccbe1-7919-4ac1-a7e2-1fc1cdd0282f`.
Follow https://app.trychert.com/skills.md and `chert guide agent` (beta.21).
The managed CLI is `@trychert/facetime@0.1.0-beta.21`, distinct from the
browser open-source connector `@trychert/facetime-opensource@0.1.0`.
Managed FaceTime uses the assigned line's number; it does not need an iPhone link.
Do not create another project, use `--restart` on an active session, buy a plan,
or replace an existing agent with `chert new`.

`chert_worker.py` registers as `AGENT_NAME` (default `vitalink-caregiver`), waits for
`chert-bridge-*`, greets only after room metadata `chert_bridge_ready`, and writes
transcripts under `sessions/`. Default `VITALINK_MODE=probe` needs LiveKit only.

### After hosted demo ends (`onboarding_done`, `demo_outcome: "ended"`)

In Terminal (outside Cursor if sandbox blocks Chert), from `backend/agent`:

```bash
export PATH="$PWD/.local/tools/node-v22.22.0-darwin-arm64/bin:$PATH"
# Fill LIVEKIT_* in .env.local first (trial uses your LiveKit project).
npx --yes --prefer-online @trychert/facetime@0.1.0-beta.21 setup --env-file .env.local --project 7dbccbe1-7919-4ac1-a7e2-1fc1cdd0282f
npx --yes --prefer-online @trychert/facetime@0.1.0-beta.21 doctor

# Terminal A — agent worker
source .venv/bin/activate
python chert_worker.py dev

# Terminal B — connect the line (same AGENT_NAME)
npx --yes --prefer-online @trychert/facetime@0.1.0-beta.21 dev --agent vitalink-caregiver
```

Then FaceTime the line number printed by `chert dev` / the overview page.

## Credentials

Put secrets only in `backend/agent/.env.local` (Chert default; gitignored). From this
directory, run `cp .env.example .env.local` **only if `.env.local` does not already
exist**, then `chmod 600 .env.local`. Optional `.env` overrides `.env.local`.
Never paste keys into chat.

| Variable | Obtain it here |
| --- | --- |
| `LIVEKIT_URL` | Open https://cloud.livekit.io, select/create your LiveKit project, and copy its WebSocket project URL (`wss://...`). |
| `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET` | Same LiveKit project → Settings → Keys; create an API key/secret pair. All three LiveKit values must come from that one project. |
| `GOOGLE_API_KEY` | https://aistudio.google.com/api-keys → Create API key; select a Google project. This is a Gemini API key, stored under the variable name expected by the LiveKit Google plugin. |
| `ELEVEN_API_KEY` | https://elevenlabs.io → Developers → API Keys → create key. Enable text-to-speech and speech-to-text access for this pipeline. Copy the full value when it is created. |
| `ELEVEN_VOICE_ID` | https://elevenlabs.io/app/voice-library → choose an accessible voice, add to My Voices if needed, and copy its Voice ID. This is an identifier, not an API key. |

`LIVEKIT_ROOM`, `AGENT_IDENTITY`, `CONNECTOR_IDENTITY`, `GEMINI_MODEL`, and
`ELEVEN_TTS_MODEL` are configuration values, not credentials. Defaults are in `.env.example`.
Model availability/quota must still be verified against your actual accounts.
Provider usage may incur charges under your accounts.

Chert CLI authorization lives in `~/.chert` and needs no pasted API key.
For a future direct HTTP integration, an owner can create a key at
https://app.trychert.com/developer; current code does not consume that key.
The open-source browser connector also needs no Chert API key.

Sources:
- https://community.livekit.io/t/where-to-find-the-livekit-api-key-and-secret/92
- https://ai.google.dev/gemini-api/docs/api-key
- https://elevenlabs.io/docs/help-center/technical/how-do-i-authorize-myself-using-an-api-key
- https://elevenlabs.io/docs/eleven-api/quickstart/

## Browser-link fallback: exact iPhone flow

This is for `facetime-opensource`, NOT the managed assigned-line integration.

1. Open FaceTime on your iPhone. Tap **New Call → Create Link**. On older iOS,
   **Create Link** may be directly on the main FaceTime screen.
2. In the share sheet, choose **Copy**, or send the link to yourself using Messages.
   Transfer it privately to your Mac. Do not put it in source files or a Git commit.
3. Open the new FaceTime link/call on the iPhone and tap **Join** to be in the call.
4. Start `python connection_probe.py` from this directory in terminal A.
5. In terminal B run `python connector_token.py`, then the open-source Chert CLI
   as described in README.md. Enter the LiveKit URL, local connector token,
   exact `AGENT_IDENTITY`, and FaceTime link at its prompts.
6. In the Chrome guest window opened by Chert, enter a guest name if requested
   and click **Join**. Allow permissions if Chrome requests them.
7. On the iPhone, accept/admit the waiting browser guest (green checkmark).
8. **Only after admission**, press Enter at the terminal prompt. The installed
   Chert 0.1.0 CLI calls `guest.connect()` at this point.
9. Listen for the probe's beep every three seconds. Speak and check terminal A
   for caller-audio frame counts and changing nonzero RMS. Keep the Mac awake.
10. Press Enter again in terminal B to stop the connector, then Ctrl-C the probe.

Sources:
- https://support.apple.com/guide/iphone/create-a-facetime-link-iphfc9b58aaa/ios
- https://github.com/cherthq/chert-facetime-opensource/blob/main/docs/GUIDE.md
- Installed connector `src/cli.mjs`, verified version 0.1.0.
