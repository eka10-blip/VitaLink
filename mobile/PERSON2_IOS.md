# Person 2 — iOS LiveKit + Presage sensing

## Phase 2 (LiveKit connection)

Goal: iPhone publishes camera → LiveKit room → worker joins and receives frames.  
`PRESAGE_MODE` stays **`mock`** (no real vitals yet).

### Distinguish two successes

| Success | Meaning | How you know |
|---|---|---|
| **A. Backend room connection** | Worker joined the LiveKit room | Session `workerConnected: true` / probe prints `A_backend_room_connection SUCCESS` |
| **B. Phone video subscription** | Worker got the iPhone camera track and frames | `videoTrackSubscribed: true` and `framesAccepted > 0` |

Phase 2 is **fully** complete only when **B** is proven on a real device.

### Prerequisites

1. Worker `.env` has real `LIVEKIT_URL`, `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`
2. `PRESAGE_MODE=mock`
3. Worker running: `cd backend/presage-worker && npm run start`
4. Mac and iPhone on the **same Wi‑Fi**

### Find your Mac’s LAN IP

On your Mac Terminal:

```bash
ipconfig getifaddr en0
```

Example result: `192.168.1.42` (yours will differ).

### Mobile env

In `mobile/.env` (create from `.env.example` if needed):

```bash
EXPO_PUBLIC_PRESAGE_WORKER_URL=http://YOUR_MAC_LAN_IP:8787
```

Use the IP from the previous step — **not** `localhost` on a physical iPhone.

### Run the iOS app (dev build — not Expo Go)

```bash
cd mobile
npm install
npx expo run:ios
```

Choose a physical iPhone if possible (camera quality is better). Allow camera permission when asked.

### Test steps on the phone

1. Open VitaLink → **Patient view** → **Check-in**
2. Tap **Start iOS sensing**
3. Allow camera access
4. Confirm you see your camera preview
5. On the same screen, watch:
   - **Worker in room: yes**
   - **Video subscribed: yes**
   - **Frames received by worker** increasing

### Watch the worker logs (Mac)

In the terminal where `npm run start` is running, you should see lines like:

- `worker room connection SUCCESS`
- `video track SUBSCRIBED`
- `received video frames framesAccepted=…`

Secrets/tokens are never logged.

### Backend-only check (no phone)

```bash
cd backend/presage-worker
npx tsx scripts/phase2-livekit-probe.ts
```

This can prove **A** (worker joined). It will say phone subscription **NOT_PROVEN_YET** unless a phone is publishing at the same time.

### Credentials reminder

- LiveKit + Presage keys stay in `backend/presage-worker/.env` only
- Mobile only receives a short-lived participant JWT from `POST /v1/sensing/sessions`
- Never paste secrets into chat or GitHub

## Official docs

- LiveKit Expo: https://docs.livekit.io/home/quickstarts/expo
- LiveKit subscribe / VideoStream: https://docs.livekit.io/transport/media/subscribe/
- SmartSpectra Node (Phase 3+): https://smartspectra.presagetech.com/docs/nodejs
