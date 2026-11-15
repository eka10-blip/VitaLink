import { randomUUID } from 'node:crypto';
import { appConfig } from './config.js';
import {
  emptyMetric,
  SensingSession,
  SessionStatus,
} from './types.js';

const sessions = new Map<string, SensingSession>();

export function createSession(patientId: string, roomName: string): SensingSession {
  const now = new Date().toISOString();
  const session: SensingSession = {
    id: randomUUID(),
    patientId,
    roomName,
    status: 'pending',
    createdAt: now,
    updatedAt: now,
    error: null,
    validationHint: null,
    pulse: emptyMetric('bpm'),
    breathing: emptyMetric('breaths/min'),
    framesAccepted: 0,
    framesRejected: 0,
    workerConnected: false,
    videoTrackSubscribed: false,
    participantIdentity: null,
    workerIdentity: null,
  };
  sessions.set(session.id, session);
  return session;
}

export function getSession(id: string): SensingSession | undefined {
  return sessions.get(id);
}

export function listSessions(): SensingSession[] {
  return [...sessions.values()].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function updateSession(
  id: string,
  patch: Partial<Omit<SensingSession, 'id' | 'createdAt' | 'patientId'>>,
): SensingSession {
  const current = sessions.get(id);
  if (!current) throw new Error(`Unknown session ${id}`);
  const next: SensingSession = {
    ...current,
    ...patch,
    updatedAt: new Date().toISOString(),
  };
  sessions.set(id, next);
  return next;
}

export function setStatus(id: string, status: SessionStatus, error: string | null = null): SensingSession {
  return updateSession(id, { status, error });
}

/** Latest completed (or in-progress) measurement for a patient — Person 4 dashboard shape helpers. */
export function latestForPatient(patientId: string): SensingSession | undefined {
  return listSessions().find((s) => s.patientId === patientId);
}

export async function forwardToPerson3(session: SensingSession): Promise<void> {
  if (!appConfig.person3MeasurementUrl) return;
  const body = {
    sessionId: session.id,
    patientId: session.patientId,
    measuredAt: session.updatedAt,
    pulse: session.pulse,
    breathing: session.breathing,
    source: 'presage',
    platform: 'ios',
  };
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    Accept: 'application/json',
  };
  if (appConfig.person3ServiceToken) {
    headers.Authorization = `Bearer ${appConfig.person3ServiceToken}`;
  }
  const response = await fetch(appConfig.person3MeasurementUrl, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
  if (!response.ok) {
    console.warn(`[person3] forward failed ${response.status}`);
  }
}
