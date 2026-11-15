/**
 * Smoke test against a running worker (default port 8787).
 *
 * - If LiveKit is NOT configured: expects offline mock to reach `completed`.
 * - If LiveKit IS configured: expects token fields + workerConnected (Phase 2 backend).
 *   Does NOT require phone frames (use phase2-livekit-probe + iPhone for that).
 *
 * Never prints tokens.
 */
const base = `http://127.0.0.1:${process.env.PORT ?? '8787'}`;

async function main() {
  const health = await fetch(`${base}/health`);
  if (!health.ok) throw new Error(`health failed: ${health.status}`);
  const healthJson = (await health.json()) as {
    livekitConfigured?: boolean;
    offlineMockAvailable?: boolean;
    presageMode?: string;
  };
  console.log('health.presageMode', healthJson.presageMode);
  console.log('health.livekitConfigured', Boolean(healthJson.livekitConfigured));
  console.log('health.offlineMockAvailable', Boolean(healthJson.offlineMockAvailable));

  const started = await fetch(`${base}/v1/sensing/sessions`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ patientId: 'smoke-patient' }),
  });
  if (!started.ok) throw new Error(`start failed: ${started.status} ${await started.text()}`);
  const session = (await started.json()) as {
    sessionId: string;
    livekitUrl?: string;
    participantToken?: string;
    roomName?: string;
  };
  console.log('started', session.sessionId);
  console.log('roomName', session.roomName);
  console.log('livekitUrlPresent', Boolean(session.livekitUrl));
  console.log('participantTokenPresent', Boolean(session.participantToken));
  console.log('participantTokenLength', session.participantToken?.length ?? 0);

  if (healthJson.livekitConfigured) {
    let workerConnected = false;
    let status = '';
    for (let i = 0; i < 30; i += 1) {
      await new Promise((r) => setTimeout(r, 400));
      const snap = await fetch(`${base}/v1/sensing/sessions/${session.sessionId}`);
      const body = (await snap.json()) as {
        status: string;
        workerConnected?: boolean;
        videoTrackSubscribed?: boolean;
        framesAccepted?: number;
      };
      status = body.status;
      workerConnected = Boolean(body.workerConnected);
      console.log(
        'poll',
        status,
        `workerConnected=${workerConnected}`,
        `videoTrackSubscribed=${Boolean(body.videoTrackSubscribed)}`,
        `framesAccepted=${body.framesAccepted ?? 0}`,
      );
      if (workerConnected || status === 'failed' || status === 'cancelled') break;
    }
    await fetch(`${base}/v1/sensing/sessions/${session.sessionId}/cancel`, { method: 'POST' }).catch(
      () => undefined,
    );
    if (!workerConnected) {
      throw new Error('LiveKit configured but workerConnected never became true');
    }
    console.log('smoke ok (LiveKit backend room connection)');
    console.log(
      'Note: phone video subscription is NOT proven by this smoke — use iPhone + phase2-livekit-probe.',
    );
    return;
  }

  let status = '';
  for (let i = 0; i < 20; i += 1) {
    await new Promise((r) => setTimeout(r, 400));
    const snap = await fetch(`${base}/v1/sensing/sessions/${session.sessionId}`);
    const body = (await snap.json()) as {
      status: string;
      pulse: { value: number | null };
      breathing: { value: number | null };
    };
    status = body.status;
    console.log('poll', body.status, 'pulse', body.pulse.value, 'breathing', body.breathing.value);
    if (status === 'completed' || status === 'failed' || status === 'cancelled') break;
  }

  if (status !== 'completed') throw new Error(`expected completed, got ${status}`);
  console.log('smoke ok (offline mock)');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
