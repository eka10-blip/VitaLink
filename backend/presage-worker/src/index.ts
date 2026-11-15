import cors from 'cors';
import express from 'express';
import { z } from 'zod';
import { appConfig, isLiveKitConfigured } from './config.js';
import { getSession, latestForPatient, listSessions } from './measurementStore.js';
import {
  getPackageProbeStatus,
  isNodeVersionSupported,
  probeSdkPackages,
} from './packageProbes.js';
import { cancelSensingSession, startSensingSession } from './sensingSession.js';

const app = express();
app.use(cors());
app.use(express.json({ limit: '1mb' }));

app.get('/health', (_req, res) => {
  const packages = getPackageProbeStatus();
  res.json({
    ok: true,
    service: 'vitalink-presage-worker',
    person: 2,
    platformFocus: 'ios',
    // Non-secret mode label (mock|live) — not a credential
    presageMode: appConfig.presageMode,
    nodeVersionSupported: isNodeVersionSupported(),
    livekitConfigured: isLiveKitConfigured(),
    smartSpectraConfigured: Boolean(appConfig.smartSpectraApiKey),
    person3ForwardConfigured: Boolean(appConfig.person3MeasurementUrl),
    smartSpectraSdkImportable: packages.smartSpectraSdkImportable,
    livekitRtcImportable: packages.livekitRtcImportable,
    packagesProbed: packages.probed,
    offlineMockAvailable: !isLiveKitConfigured() && appConfig.presageMode === 'mock',
  });
});

/**
 * Start an iOS sensing session.
 * Without LiveKit credentials in mock mode, runs an offline mock session (no invented vitals).
 */
app.post('/v1/sensing/sessions', async (req, res) => {
  const body = z
    .object({
      patientId: z.string().min(1).default('patient'),
      roomName: z.string().min(1).optional(),
    })
    .safeParse(req.body ?? {});

  if (!body.success) {
    res.status(400).json({ error: body.error.flatten() });
    return;
  }

  try {
    const session = await startSensingSession(body.data);
    res.status(201).json(session);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    res.status(500).json({ error: message });
  }
});

app.get('/v1/sensing/sessions/:id', (req, res) => {
  const session = getSession(req.params.id);
  if (!session) {
    res.status(404).json({ error: 'Session not found' });
    return;
  }
  res.json(session);
});

app.post('/v1/sensing/sessions/:id/cancel', async (req, res) => {
  const session = await cancelSensingSession(req.params.id);
  if (!session) {
    res.status(404).json({ error: 'Session not found' });
    return;
  }
  res.json(session);
});

app.get('/v1/sensing/sessions', (_req, res) => {
  res.json({ sessions: listSessions() });
});

/** Latest Person-4-compatible measurement fields for a patient. */
app.get('/v1/measurements/latest', (req, res) => {
  const patientId = String(req.query.patientId ?? 'patient');
  const session = latestForPatient(patientId);
  if (!session) {
    res.status(404).json({ error: 'No measurements yet' });
    return;
  }
  res.json({
    patientId: session.patientId,
    sessionId: session.id,
    status: session.status,
    validationHint: session.validationHint,
    pulse: session.pulse,
    breathing: session.breathing,
    measuredAt: session.updatedAt,
    platform: 'ios',
    source: 'presage',
  });
});

app.listen(appConfig.port, () => {
  console.log(
    `[presage-worker] listening on :${appConfig.port} mode=${appConfig.presageMode} livekit=${isLiveKitConfigured()}`,
  );
  void probeSdkPackages().then((packages) => {
    console.log(
      `[presage-worker] package probes smartSpectra=${packages.smartSpectraSdkImportable} livekitRtc=${packages.livekitRtcImportable}`,
    );
  });
});
