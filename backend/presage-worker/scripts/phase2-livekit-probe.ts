/**
 * Phase 2 probe — distinguishes:
 * A) Backend worker joined a LiveKit room
 * B) Phone video track subscribed + frames received
 *
 * Never prints tokens or secrets.
 *
 * Usage (worker must be running):
 *   npx tsx scripts/phase2-livekit-probe.ts
 */
const base = `http://127.0.0.1:${process.env.PORT ?? '8787'}`;
const WAIT_MS = Number(process.env.PHASE2_WAIT_MS ?? 20_000);
/** Set PHASE2_WAIT_FOR_PHONE=1 to keep waiting for frames (run while iPhone is publishing). */
const WAIT_FOR_PHONE = process.env.PHASE2_WAIT_FOR_PHONE === '1';

type SessionSnap = {
  id: string;
  roomName: string;
  status: string;
  workerConnected: boolean;
  videoTrackSubscribed: boolean;
  framesAccepted: number;
  error: string | null;
  participantIdentity: string | null;
  workerIdentity: string | null;
};

async function main() {
  const healthRes = await fetch(`${base}/health`);
  if (!healthRes.ok) throw new Error(`health failed: ${healthRes.status}`);
  const health = (await healthRes.json()) as {
    livekitConfigured?: boolean;
    offlineMockAvailable?: boolean;
    presageMode?: string;
  };
  console.log('health.livekitConfigured', Boolean(health.livekitConfigured));
  console.log('health.presageMode', health.presageMode);
  console.log('health.offlineMockAvailable', Boolean(health.offlineMockAvailable));

  if (!health.livekitConfigured) {
    throw new Error('LiveKit is not configured — cannot run Phase 2 probe');
  }

  const startedRes = await fetch(`${base}/v1/sensing/sessions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ patientId: 'phase2-probe' }),
  });
  if (!startedRes.ok) {
    throw new Error(`start failed: ${startedRes.status} ${await startedRes.text()}`);
  }
  const started = (await startedRes.json()) as {
    sessionId: string;
    roomName: string;
    livekitUrl: string;
    participantToken: string;
    participantIdentity: string;
    status: string;
  };

  console.log('sessionId', started.sessionId);
  console.log('roomName', started.roomName);
  console.log('participantIdentity', started.participantIdentity);
  console.log('livekitUrlPresent', Boolean(started.livekitUrl));
  console.log('participantTokenPresent', Boolean(started.participantToken));
  console.log('participantTokenLength', started.participantToken?.length ?? 0);
  // Never print token or full URL credentials

  let last: SessionSnap | null = null;
  const deadline = Date.now() + WAIT_MS;
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 500));
    const snapRes = await fetch(`${base}/v1/sensing/sessions/${started.sessionId}`);
    last = (await snapRes.json()) as SessionSnap;
    console.log(
      'poll',
      `status=${last.status}`,
      `workerConnected=${last.workerConnected}`,
      `videoTrackSubscribed=${last.videoTrackSubscribed}`,
      `framesAccepted=${last.framesAccepted}`,
    );
    if (last.status === 'failed' || last.status === 'cancelled' || last.status === 'completed') {
      break;
    }
    if (last.workerConnected && last.videoTrackSubscribed && last.framesAccepted > 0) {
      break;
    }
    // Backend-only proof: stop once the worker has joined (unless waiting for a phone).
    if (last.workerConnected && !WAIT_FOR_PHONE) {
      break;
    }
  }

  // Cancel so the worker disconnects cleanly for this probe.
  await fetch(`${base}/v1/sensing/sessions/${started.sessionId}/cancel`, { method: 'POST' }).catch(
    () => undefined,
  );

  if (!last) throw new Error('No session snapshot received');

  const backendRoomConnection = Boolean(last.workerConnected);
  const phoneVideoSubscription = Boolean(last.videoTrackSubscribed && last.framesAccepted > 0);

  console.log('--- Phase 2 results ---');
  console.log('A_backend_room_connection', backendRoomConnection ? 'SUCCESS' : 'FAIL');
  console.log(
    'B_phone_video_subscription',
    phoneVideoSubscription ? 'SUCCESS' : 'NOT_PROVEN_YET',
  );
  console.log('framesAccepted', last.framesAccepted);
  if (last.error) console.log('sessionError', last.error);

  if (!backendRoomConnection) {
    process.exitCode = 1;
    console.error(
      'Phase 2 partial FAIL: worker did not report workerConnected=true. Check LiveKit URL/keys and worker logs.',
    );
    return;
  }

  if (!phoneVideoSubscription) {
    console.log(
      'Phase 2 backend OK. Phone camera subscription not proven in this probe (no publisher). Use iPhone steps in PERSON2_IOS.md.',
    );
    // Exit 0 for backend success; phone proof is a separate manual step.
    return;
  }

  console.log('Phase 2 FULL SUCCESS: backend joined and received phone video frames.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
