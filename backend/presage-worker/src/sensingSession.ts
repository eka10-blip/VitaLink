import { appConfig, assertPresageLiveConfigured, isLiveKitConfigured } from './config.js';
import { mintParticipantToken } from './livekitTokens.js';
import {
  createSession,
  forwardToPerson3,
  getSession,
  setStatus,
  updateSession,
} from './measurementStore.js';
import { SmartSpectraPipeline } from './smartSpectraPipeline.js';
import { readingFromSample } from './quality.js';
import type { SensingSession, StartSessionResponse } from './types.js';

const activeControllers = new Map<string, AbortController>();

/** Safe session logs — never log tokens, API keys, or secrets. */
function sessionLog(sessionId: string, message: string, extra?: Record<string, string | number | boolean | null>) {
  const suffix = extra
    ? ` ${Object.entries(extra)
        .map(([k, v]) => `${k}=${v}`)
        .join(' ')}`
    : '';
  console.log(`[livekit session=${sessionId}] ${message}${suffix}`);
}

export async function startSensingSession(input: {
  patientId: string;
  roomName?: string;
}): Promise<StartSessionResponse> {
  assertPresageLiveConfigured();

  const patientId = input.patientId.trim() || 'patient';
  const session = createSession(patientId, 'pending-room');
  const roomName = input.roomName?.trim() || `vitalink-${patientId}-${session.id.slice(0, 8)}`;
  updateSession(session.id, { roomName });

  const participantIdentity = `ios-patient-${patientId}`;
  const workerIdentity = `presage-worker-${session.id.slice(0, 8)}`;
  updateSession(session.id, { participantIdentity, workerIdentity });

  const controller = new AbortController();
  activeControllers.set(session.id, controller);

  // Offline mock: no LiveKit credentials required — verifies worker HTTP + session lifecycle.
  if (!isLiveKitConfigured()) {
    if (appConfig.presageMode === 'live') {
      activeControllers.delete(session.id);
      throw new Error(
        'PRESAGE_MODE=live requires LIVEKIT_URL, LIVEKIT_API_KEY, and LIVEKIT_API_SECRET.',
      );
    }
    sessionLog(session.id, 'offline mock path (LiveKit not configured)');
    setStatus(session.id, 'measuring', null);
    void runOfflineMockPipeline(session.id, controller.signal).catch((err) => {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[livekit session=${session.id}] mock failed:`, message);
      setStatus(session.id, 'failed', message);
      activeControllers.delete(session.id);
    });
    return {
      sessionId: session.id,
      roomName,
      livekitUrl: '',
      participantToken: '',
      participantIdentity,
      status: 'measuring',
    };
  }

  sessionLog(session.id, 'minting LiveKit tokens', {
    roomName,
    participantIdentity,
    workerIdentity,
    presageMode: appConfig.presageMode,
  });

  const participantToken = await mintParticipantToken({
    identity: participantIdentity,
    roomName,
    canPublish: true,
    canSubscribe: false,
  });
  const workerToken = await mintParticipantToken({
    identity: workerIdentity,
    roomName,
    canPublish: false,
    canSubscribe: true,
  });

  setStatus(session.id, 'waiting_for_video');
  sessionLog(session.id, 'tokens minted (values not logged); starting worker join', {
    roomName,
    status: 'waiting_for_video',
  });

  void runLiveKitPipeline(session.id, workerToken, controller).catch(async (err) => {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[livekit session=${session.id}] pipeline failed:`, message);
    setStatus(session.id, 'failed', message);
    activeControllers.delete(session.id);
  });

  return {
    sessionId: session.id,
    roomName,
    livekitUrl: appConfig.livekitUrl,
    participantToken,
    participantIdentity,
    status: 'waiting_for_video',
  };
}

export async function cancelSensingSession(sessionId: string): Promise<SensingSession | undefined> {
  sessionLog(sessionId, 'cancel requested');
  const controller = activeControllers.get(sessionId);
  controller?.abort();
  activeControllers.delete(sessionId);
  const session = getSession(sessionId);
  if (!session) return undefined;
  if (session.status === 'completed') return session;
  return setStatus(sessionId, 'cancelled');
}

/** Completes a mock session without LiveKit / SmartSpectra — never invents vital numbers. */
async function runOfflineMockPipeline(sessionId: string, signal: AbortSignal): Promise<void> {
  updateSession(sessionId, {
    validationHint:
      'Offline mock mode (no LiveKit credentials). Set LIVEKIT_* and optionally PRESAGE_MODE=live for real sensing.',
  });

  for (let i = 0; i < 6; i += 1) {
    if (signal.aborted) return;
    await sleep(500);
    const session = getSession(sessionId);
    if (!session || session.status === 'cancelled') return;
    updateSession(sessionId, {
      framesAccepted: i + 1,
      status: 'measuring',
    });
  }

  if (signal.aborted) return;
  const completed = updateSession(sessionId, {
    status: 'completed',
    pulse: readingFromSample('bpm', null, 0, new Date().toISOString()),
    breathing: readingFromSample('breaths/min', null, 0, new Date().toISOString()),
    validationHint: 'Mock complete — no vitals invented. Configure LiveKit + Presage for real estimates.',
  });
  void forwardToPerson3(completed);
  activeControllers.delete(sessionId);
}

async function runLiveKitPipeline(
  sessionId: string,
  workerToken: string,
  controller: AbortController,
): Promise<void> {
  const signal = controller.signal;
  const sessionMeta = getSession(sessionId);
  const roomName = sessionMeta?.roomName ?? 'unknown';
  const workerIdentity = sessionMeta?.workerIdentity ?? 'unknown';

  const {
    Room,
    RoomEvent,
    TrackKind,
    VideoStream,
    VideoBufferType,
  } = await import('@livekit/rtc-node');

  const room = new Room();
  let pipeline: SmartSpectraPipeline | null = null;
  let videoTask: Promise<void> | null = null;
  let videoStream: InstanceType<typeof VideoStream> | null = null;
  let cleaned = false;

  const cleanup = async () => {
    if (cleaned) return;
    cleaned = true;
    sessionLog(sessionId, 'cleanup: disconnecting worker from room', { roomName });
    try {
      await videoStream?.cancel();
    } catch {
      /* ignore */
    }
    if (pipeline) {
      await pipeline.stop().catch(() => undefined);
      pipeline = null;
    }
    // Disconnect this room only. Do NOT call process-wide dispose() here —
    // that breaks later sessions in the same worker process.
    await room.disconnect().catch(() => undefined);
    activeControllers.delete(sessionId);
  };

  signal.addEventListener('abort', () => {
    void cleanup();
  });

  const onMetrics = (update: {
    pulse: ReturnType<typeof readingFromSample>;
    breathing: ReturnType<typeof readingFromSample>;
    validationHint: string | null;
    fatal?: boolean;
  }) => {
    const current = getSession(sessionId);
    if (!current || current.status === 'cancelled' || current.status === 'failed') return;

    if (update.fatal) {
      setStatus(
        sessionId,
        'failed',
        update.validationHint || pipeline?.getFatalMessage() || 'Presage pipeline failed',
      );
      controller.abort();
      return;
    }

    const next = updateSession(sessionId, {
      pulse: update.pulse.value != null ? update.pulse : current.pulse,
      breathing: update.breathing.value != null ? update.breathing : current.breathing,
      validationHint:
        update.validationHint !== undefined && update.validationHint !== null
          ? update.validationHint
          : current.validationHint,
      status: current.status === 'waiting_for_video' ? 'measuring' : current.status,
    });

    const elapsed = pipeline?.elapsedSeconds() ?? 0;
    const hasPulse = next.pulse.value != null;
    const hasBreathing = next.breathing.value != null;
    const ready =
      elapsed >= appConfig.minMeasurementSeconds && (hasPulse || hasBreathing);

    if (ready && next.status !== 'completed') {
      const completed = updateSession(sessionId, {
        status: 'completed',
        validationHint:
          hasPulse && hasBreathing
            ? 'Measurement complete'
            : 'Measurement window finished — some vitals may still be limited.',
      });
      void forwardToPerson3(completed);
      controller.abort();
    }
  };

  // Phase 3+: start SmartSpectra only in live mode (requires SMARTSPECTRA_API_KEY).
  if (appConfig.presageMode === 'live') {
    pipeline = new SmartSpectraPipeline(onMetrics);
    await pipeline.start();
  }

  sessionLog(sessionId, 'worker connecting to LiveKit room', {
    roomName,
    workerIdentity,
  });

  try {
    await room.connect(appConfig.livekitUrl, workerToken, {
      autoSubscribe: true,
      dynacast: true,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    updateSession(sessionId, {
      workerConnected: false,
      error: `LiveKit worker connect failed: ${message}`,
      status: 'failed',
    });
    sessionLog(sessionId, 'worker room connection FAILED', { roomName, error: message });
    await cleanup();
    throw err;
  }

  updateSession(sessionId, {
    workerConnected: true,
    validationHint: 'Worker joined LiveKit room. Waiting for iPhone camera track…',
  });
  sessionLog(sessionId, 'worker room connection SUCCESS', {
    roomName,
    workerIdentity,
    workerConnected: true,
  });

  const attachVideo = (track: { kind?: number }, fromIdentity?: string) => {
    if (track.kind !== TrackKind.KIND_VIDEO) return;
    if (videoTask) return;

    updateSession(sessionId, {
      videoTrackSubscribed: true,
      status: 'measuring',
      validationHint:
        appConfig.presageMode === 'mock'
          ? 'Video track subscribed (Presage still mock — counting frames only).'
          : 'Video track subscribed; measuring…',
    });
    sessionLog(sessionId, 'video track SUBSCRIBED', {
      roomName,
      fromIdentity: fromIdentity ?? 'unknown',
      videoTrackSubscribed: true,
    });

    videoStream = new VideoStream(track as never);
    videoTask = consumeVideo(sessionId, videoStream, pipeline, signal, VideoBufferType);
  };

  room.on(RoomEvent.TrackSubscribed, (track, _publication, participant) => {
    attachVideo(track as { kind?: number }, participant?.identity);
  });

  room.on(RoomEvent.ParticipantConnected, (participant) => {
    sessionLog(sessionId, 'remote participant connected', {
      roomName,
      identity: participant.identity,
    });
  });

  room.on(RoomEvent.Disconnected, () => {
    sessionLog(sessionId, 'worker disconnected from room', { roomName });
  });

  for (const participant of room.remoteParticipants.values()) {
    sessionLog(sessionId, 'existing remote participant', {
      roomName,
      identity: participant.identity,
    });
    for (const publication of participant.trackPublications.values()) {
      if (publication.track) {
        attachVideo(publication.track as { kind?: number }, participant.identity);
      }
    }
  }

  // Soft deadline: finish with whatever vitals we have (breathing window ~30s+).
  const softDeadlineMs = (appConfig.minMeasurementSeconds + 25) * 1000;
  const deadlineTimer = setTimeout(() => {
    const current = getSession(sessionId);
    if (!current || current.status === 'completed' || current.status === 'failed' || current.status === 'cancelled') {
      return;
    }
    if (current.pulse.value != null || current.breathing.value != null) {
      const completed = updateSession(sessionId, {
        status: 'completed',
        validationHint: 'Measurement window finished.',
      });
      void forwardToPerson3(completed);
      controller.abort();
      return;
    }
    setStatus(
      sessionId,
      'failed',
      'No pulse/breathing yet after the measurement window. Keep your face centered with good light, then try again.',
    );
    controller.abort();
  }, softDeadlineMs);

  await waitUntilSettled(sessionId, signal);
  clearTimeout(deadlineTimer);
  await cleanup();
}

async function consumeVideo(
  sessionId: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  stream: AsyncIterable<any>,
  pipeline: SmartSpectraPipeline | null,
  signal: AbortSignal,
  VideoBufferType: { RGB24: number },
): Promise<void> {
  let syntheticTs = 0;
  const frameIntervalUs = 33_333;
  let lastLoggedFrames = 0;

  try {
    for await (const event of stream) {
      if (signal.aborted) break;
      const session = getSession(sessionId);
      if (!session || session.status === 'cancelled' || session.status === 'completed') break;

      let frame = event.frame as {
        type: number;
        data: Uint8Array;
        width: number;
        height: number;
        convert: (t: number) => {
          type: number;
          data: Uint8Array;
          width: number;
          height: number;
          convert: (t: number) => never;
        };
      };
      if (frame.type !== VideoBufferType.RGB24) {
        frame = frame.convert(VideoBufferType.RGB24) as typeof frame;
      }

      const rawTs = event.timestampUs;
      const eventTs =
        typeof rawTs === 'bigint' ? Number(rawTs) : typeof rawTs === 'number' ? rawTs : null;
      syntheticTs += frameIntervalUs;
      const timestampUs = eventTs && eventTs > 0 ? eventTs : syntheticTs;

      if (appConfig.presageMode === 'mock') {
        const accepted = session.framesAccepted + 1;
        updateSession(sessionId, {
          framesAccepted: accepted,
          status: 'measuring',
          validationHint:
            'Mock Presage mode with LiveKit frames — set PRESAGE_MODE=live and SMARTSPECTRA_API_KEY for real vitals.',
        });
        if (accepted === 1 || accepted % 30 === 0) {
          sessionLog(sessionId, 'received video frames', {
            framesAccepted: accepted,
            width: frame.width,
            height: frame.height,
          });
        }
        lastLoggedFrames = accepted;
        if (accepted >= 90) {
          sessionLog(sessionId, 'mock frame quota reached; completing without vitals', {
            framesAccepted: accepted,
          });
          const completed = updateSession(sessionId, {
            status: 'completed',
            pulse: readingFromSample('bpm', null, 0, new Date().toISOString()),
            breathing: readingFromSample('breaths/min', null, 0, new Date().toISOString()),
          });
          void forwardToPerson3(completed);
          break;
        }
        continue;
      }

      if (!pipeline) continue;
      if (pipeline.isFatal()) {
        setStatus(sessionId, 'failed', pipeline.getFatalMessage() || 'Presage pipeline failed');
        break;
      }

      let accepted = false;
      try {
        accepted = pipeline.sendRgbFrame(frame.data, frame.width, frame.height, timestampUs);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        setStatus(sessionId, 'failed', `Presage sendFrame failed: ${message}`);
        break;
      }
      if (pipeline.isFatal()) {
        setStatus(sessionId, 'failed', pipeline.getFatalMessage() || 'Presage pipeline failed');
        break;
      }

      const nextAccepted = session.framesAccepted + (accepted ? 1 : 0);
      const nextRejected = session.framesRejected + (accepted ? 0 : 1);
      updateSession(sessionId, {
        framesAccepted: nextAccepted,
        framesRejected: nextRejected,
      });
      if (nextAccepted === 1 || nextAccepted - lastLoggedFrames >= 30) {
        sessionLog(sessionId, 'forwarded frames to Presage', {
          framesAccepted: nextAccepted,
          framesRejected: nextRejected,
        });
        lastLoggedFrames = nextAccepted;
      }
    }
  } catch (err) {
    if (!signal.aborted) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[livekit session=${sessionId}] video loop error:`, message);
      try {
        setStatus(sessionId, 'failed', message);
      } catch {
        /* session may already be gone */
      }
    }
  }
}

function waitUntilSettled(sessionId: string, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    const timer = setInterval(() => {
      const session = getSession(sessionId);
      if (
        !session ||
        signal.aborted ||
        session.status === 'completed' ||
        session.status === 'failed' ||
        session.status === 'cancelled'
      ) {
        clearInterval(timer);
        resolve();
      }
    }, 500);
  });
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
