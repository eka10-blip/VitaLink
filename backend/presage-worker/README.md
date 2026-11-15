# Person 2 — Presage worker (iOS path)

LiveKit video subscriber + [Presage SmartSpectra](https://smartspectra.presagetech.com/docs) vitals measurement for VitaLink.

**Scope:** iOS patient phones publish the front camera into a LiveKit room; this worker joins the same room, feeds decoded frames into SmartSpectra via the official Node custom-input API, and exposes pulse/breathing for Person 4.

Android client publish is intentionally out of scope.

## Phase status

- **Phase 1:** Config + dependency verification — done when `/health` booleans look correct.
- **Phase 2:** Real LiveKit room join + (with iPhone) video track subscription.
  - Keep **`PRESAGE_MODE=mock`** during Phase 2.
  - **A = backend room connection** (`workerConnected: true`)
  - **B = phone video subscription** (`videoTrackSubscribed: true` and `framesAccepted > 0`)
  - Phase 2 is fully complete only when **B** is proven on a device.
- Real Presage vitals are **Phase 3+** (`PRESAGE_MODE=live`).

### Phase 2 commands

```bash
# Worker must already be running (npm run start)
npm run smoke
npx tsx scripts/phase2-livekit-probe.ts
```

Phone steps: see `../../mobile/PERSON2_IOS.md`.

## Requirements

| Requirement | Notes |
|---|---|
| Node.js | **20+** (Presage Node SDK). This project sets `"engines": { "node": ">=20" }`. |
| npm | Comes with Node |
| Packages | `@smartspectra/node-sdk`, `@livekit/rtc-node`, `livekit-server-sdk` are **required** dependencies |

Official docs:

- SmartSpectra Node: https://smartspectra.presagetech.com/docs/nodejs
- LiveKit Expo (mobile client, later phases): https://docs.livekit.io/home/quickstarts/expo
- LiveKit subscribe / frames: https://docs.livekit.io/transport/media/subscribe/

## Setup (Phase 1)

```bash
cd backend/presage-worker
cp .env.example .env
# Leave PRESAGE_MODE=mock and leave secret fields empty for Phase 1.
npm install
npm run typecheck
npm run start
```

In another terminal:

```bash
curl -s http://127.0.0.1:8787/health
npm run smoke
```

### Environment variable names (supported by `src/config.ts`)

| Name | Required now? | Purpose |
|---|---|---|
| `PORT` | No (default `8787`) | HTTP port |
| `PRESAGE_MODE` | No (default `mock`) | `mock` or `live` |
| `LIVEKIT_URL` | For Phase 2+ | LiveKit WebSocket URL |
| `LIVEKIT_API_KEY` | For Phase 2+ | LiveKit API key |
| `LIVEKIT_API_SECRET` | For Phase 2+ | LiveKit API secret |
| `SMARTSPECTRA_API_KEY` | For Phase 3+ / `live` | Presage API key |
| `PERSON3_MEASUREMENT_URL` | Optional | Forward measurements to Person 3 |
| `PERSON3_SERVICE_TOKEN` | Optional | Auth for Person 3 forward |
| `MIN_MEASUREMENT_SECONDS` | No (default `35`) | Live completion window |

**Never commit `.env`.** Never paste secrets into chat, README, or logs.

## Architecture (target)

```text
iOS Expo app (Person 2 sensing UI)
  └─ publishes front camera → LiveKit room
backend/presage-worker
  └─ subscribes with @livekit/rtc-node VideoStream
  └─ SmartSpectra Node SDK: useCustomInput() → start() → sendFrame(RGB24, …)
  └─ stores session metrics + optional POST to Person 3
Person 4 UI
  └─ reads pulse/breathing (source: "presage")
```

Official SmartSpectra APIs used in code (do not invent others):

- `useCustomInput`, `start`, `sendFrame`, `decodeMetrics`, `breathingMetrics`, `cardioMetrics`

## HTTP API

| Method | Path | Description |
|---|---|---|
| GET | `/health` | Booleans for config + package import probes (no secrets) |
| POST | `/v1/sensing/sessions` | Start session; returns iOS LiveKit token when configured |
| GET | `/v1/sensing/sessions/:id` | Poll status + metrics |
| POST | `/v1/sensing/sessions/:id/cancel` | Cancel |
| GET | `/v1/measurements/latest?patientId=` | Latest Person-4-shaped metrics |

### `/health` fields (Phase 1)

All credential-related fields are **booleans** (or non-secret mode labels):

- `nodeVersionSupported`
- `livekitConfigured`
- `smartSpectraConfigured`
- `person3ForwardConfigured`
- `smartSpectraSdkImportable`
- `livekitRtcImportable`
- `packagesProbed`
- `offlineMockAvailable`
- `presageMode` (`mock` \| `live`)

## Mock vs live

| Mode | Behavior |
|---|---|
| `mock` (default) | Session lifecycle works without LiveKit/Presage keys. **Never invents** heart/breathing numbers (`value: null`, `quality: unavailable`). |
| `live` | Requires `SMARTSPECTRA_API_KEY` (+ LiveKit for real camera). Uses official SDK custom input. |

## iOS client

See `mobile/PERSON2_IOS.md` (later phases). Build with `npx expo run:ios` (Expo Go is not supported for LiveKit).

## Wellness disclaimer

SDK metrics are for general wellness and informational purposes only. They have not been cleared by the FDA and may not be used for medical diagnosis or treatment.
