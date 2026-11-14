# VitaLink — Person 4 (Mobile patient app + family dashboard)

This is an **independent React Native / Expo TypeScript source project** built for Person 4's responsibilities. It intentionally does **not** implement Person 1's Chert/ElevenLabs conversation engine, Person 2's Presage/LiveKit sensing, or Person 3's Gemini/Supabase pipeline. It shows their outputs through a consistent data contract.

## Delivered

- Patient home screen with daily check-in entry point, latest metrics, caregiver status
- Patient check-in flow explaining sensing → conversation → reports
- Patient and caregiver report screens with recent check-in history
- Family dashboard with linked patient, measurements, activity history, alert counts
- Alert inbox with an interactive **Mark as reviewed** action
- Working **synthetic DEMO MODE**: complete sample check-in, simulate an alert, switch role, acknowledge alert
- Live-mode backend adapter with explicit auth hook and **no fake data fallback**
- 15-second dashboard polling for integration; backend authentication remains necessary
- Browser-openable `preview/preview.html` for showing the UI without installing anything

All demo patients, measurements, alerts and reports are synthetic. No real fall, diagnosis, or medical device reliability is claimed.

## Run it on your Mac (Expo)

1. Install Node.js 22+ if needed (Expo 57 requires a recent Node 22 version).
2. Extract this folder and open a Terminal **inside `VitaLink-Person4-Mobile`**.
3. Run:

```bash
npm install
npx expo install --fix
npx expo start
```

4. Install **Expo Go** on your phone, then scan Expo's QR code. Your Mac and phone should be on the same network. You can also run iOS Simulator if Xcode is set up.

Expo SDK 57 / React Native 0.86 are targeted for compatibility with Expo Go. If using a newer Expo template, copy `App.tsx` and `src/` into that template and use its installed dependency versions.

**Instant preview:** Double-click `preview/preview.html`. It's a separate lightweight browser-only clickable mockup, useful for validating the screen layout before installing Expo. The actual mobile app lives in `App.tsx`.

## Test the complete demo workflow

1. Open the app. It should clearly say `DEMO · FICTIONAL`.
2. From `Patient view`, open `Check-in` and tap **Complete sample check-in**.
3. On the same tab, tap **Simulate no-response alert** (explicit test event, not fall detection).
4. Switch to `Family dashboard`, open `Alerts`, and tap **Mark as reviewed**.
5. Open `Reports` in each role to see different wording for the two audiences.
6. Wait 15 seconds or tap refresh to verify state remains consistent between the screens.

Demo data lives only in memory and resets on app restart. **Do not use it as actual health information.**

## Connect to Person 3's backend

The supplied GitHub repository root was accessible, but the backend folder files could **not** be opened through the available browsing connection. Therefore the endpoints in `src/liveRepository.ts` and `INTEGRATION_CONTRACT.md` are **proposals to align with your team**, not assertions that these endpoints already exist.

1. Ask Person 3 for existing backend routes and schema (or share the actual backend files).
2. Make the `Dashboard` response from `src/models.ts` match their API, or update `src/liveRepository.ts` to transform their API response.
3. Configure authenticated token retrieval with `setAccessTokenProvider` using their actual Supabase Auth integration. **Do not** hardcode any tokens, service-role keys, or patient records into app code or `EXPO_PUBLIC_*` environment variables.
4. Add `.env` with `EXPO_PUBLIC_VITALINK_API_URL=https://<your-authorized-backend>`.
5. Rebuild/restart Expo. The app then uses live mode and **does not fall back to fictional readings** if the server fails.

**Important:** This package does not yet provide a login screen or Supabase Auth implementation; it does not claim to be ready for real patient data. Before handling real information, the backend must check that the signed-in user has access to the patient/caregiver's records. All relevant tables should enforce Row Level Security and verified sharing permissions. No production medical monitoring is supported.

## Who builds what

| Teammate | Owns | How Person 4 connects |
|---|---|---|
| Person 1 | Chert + ElevenLabs check-in and transcript | Write session/transcript to backend; frontend displays outcome and check-in history |
| Person 2 | LiveKit + Presage pulse/breathing estimates | Write a measurement record to backend; UI renders available values with source/quality |
| Person 3 | Gemini + Supabase care plans, reports, API | Provide secure `Dashboard` JSON and acknowledge/check-in endpoints |
| **Person 4 (you)** | Patient app, caregiver dashboard, shared presentation flow | This package |

## Limitations

- No actual Presage sensor session or ElevenLabs calls are included (they belong to Persons 1/2).
- No push notification service is implemented; caregiver alerts are visible in-app after polling and in demo simulation.
- Acknowledging an alert does not mean the person has been contacted.
- No real-world fall detection or reliable emergency response is claimed.
- The UI supports one linked patient in this MVP; expand only after the core workflow is stable.
- Patient vs caregiver role switching **is only enabled in demo mode**. In live mode, roles must be decided by authenticated backend claims, not by a client-side toggle.

## Source and event handoff

See `INTEGRATION_CONTRACT.md`. Keep all integration credentials out of GitHub.

## Optionally integrate into your existing team GitHub repo

Your repository currently has a `mobile/` folder. **Create your own branch first** and merge rather than changing `main` directly:

```bash
git clone https://github.com/eka10-blip/VitaLink.git
cd VitaLink
git switch -c person4-mobile-ui
```

Then from the extracted starter directory, run the safe-copy script (replace the path to your cloned repo):

```bash
bash scripts/copy-into-vitalink-repo.sh /full/path/to/VitaLink
```

The script checks for collisions **before** copying anything. If there are any conflicting filenames, it stops so you can merge manually instead of overwriting team code.

```bash
cd /full/path/to/VitaLink
git status
git add mobile
git commit -m "Build VitaLink patient and caregiver mobile UI"
git push -u origin person4-mobile-ui
```

Open a pull request into `main` and ask your teammates to review it. The script leaves any pre-existing `mobile/README.md` intact and adds `PERSON4_README.md`.
