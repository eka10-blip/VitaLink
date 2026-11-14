# VitaLink FaceTime agent — Person 1

Connection milestone only. AI conversation and transcript capture follow a verified call.
Use this directory independently of the mobile app. No root dependency changes required.

## Setup (macOS / Linux)

From `backend/agent`, use Python 3.10–3.13 (3.12 recommended):

```sh
python3.12 -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements.lock.txt
cp .env.example .env
chmod 600 .env
```

Fill in `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET` locally.
Keep all secrets out of Git, screenshots and chat. Keep room/identity values consistent
between both terminals. The connector does not dispatch an agent: the probe joins directly.

## First call: verify the transport

1. Terminal A, from this directory:

   ```sh
   source .venv/bin/activate
   python connection_probe.py
   ```

2. Terminal B, from this directory:

   ```sh
   source .venv/bin/activate
   python connector_token.py
   ```

3. Use Node >=22.22 and Google Chrome. Run the official connector:

   ```sh
   npx @trychert/facetime-opensource@0.1.0
   ```

   Enter the LiveKit URL, token from `.local/connector-token.txt`, and exact
   `AGENT_IDENTITY` (default `vitalink-agent`). On macOS, copy the token without
   displaying it: `pbcopy < .local/connector-token.txt`.
   The token uses `CONNECTOR_IDENTITY`, is scoped to `LIVEKIT_ROOM`, and expires
   after 30 minutes. Generate another if needed.

4. Create a FaceTime link on your iPhone; paste it at the connector's hidden prompt.
   Click Join in Chrome and admit the guest on the iPhone. Then use Connect LiveKit
   in the local connector tab if prompted. Keep Chrome and the computer running.
5. On the iPhone, confirm a quiet beep every 3 seconds. Speak into the iPhone and
   verify `Caller audio` logs with nonzero/changing `peak_rms` in terminal A.
   Use headphones to distinguish caller speech from feedback of the beep.
6. Stop the connector and Ctrl-C the probe. Record the observed results in HANDOFF.md.

The probe publishes audio only: no avatar/video yet. A joined room alone does not
prove FaceTime media works. Nonzero RMS alone does not prove intelligible speech.
Do not run the later conversational agent with the probe's identity at the same time.

## Troubleshooting

- No room connection: check URL, API key/secret and network; token must match the project.
- No beep: check exact agent participant identity, iPhone admission, connector tab connection,
  phone volume and browser audio permissions.
- No incoming frames: verify caller is unmuted and connector publishes to the same room.
- Token rejected: regenerate it; connector identity must differ from the agent identity.
- Node not found: install Node >=22.22 or use the local runtime noted in HANDOFF.md.

## Cursor continuation

Read `HANDOFF.md` first. Resolve the repository location and read its AGENTS.md before
copying/merging these files. Keep edits within `backend/agent/`. Do not overwrite an
existing teammate directory. Gate provider integration on the verified call result.
