import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { appConfig } from './config.js';
import {
  emptyMetric,
  SensingSession,
  SessionStatus,
} from './types.js';

const sessions = new Map<string, SensingSession>();
let persistDirty = false;
let persistTimer: ReturnType<typeof setTimeout> | null = null;

const storePath =
  process.env.SESSION_STORE_PATH?.trim() ||
  join(process.env.TMPDIR || '/tmp', 'vitalink-presage-sessions.json');

function persistNow(): void {
  try {
    mkdirSync(dirname(storePath), { recursive: true });
    const tmp = `${storePath}.tmp`;
    // Cap stored history so restarts stay cheap.
    const values = [...sessions.values()]
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .slice(0, 20);
    writeFileSync(tmp, JSON.stringify(values), 'utf8');
    renameSync(tmp, storePath);
    persistDirty = false;
  } catch (err) {
    console.warn('[sessions] persist failed:', err instanceof Error ? err.message : err);
  }
}

function persist(force = false): void {
  persistDirty = true;
  if (force) {
    if (persistTimer) {
      clearTimeout(persistTimer);
      persistTimer = null;
    }
    persistNow();
    return;
  }
  if (persistTimer) return;
  persistTimer = setTimeout(() => {
    persistTimer = null;
    if (persistDirty) persistNow();
  }, 1500);
}

function restore(): void {
  try {
    if (!existsSync(storePath)) return;
    const raw = readFileSync(storePath, 'utf8').trim();
    if (!raw) return;
    const list = JSON.parse(raw) as SensingSession[];
    if (!Array.isArray(list)) return;
    for (const session of list) {
      if (session?.id) sessions.set(session.id, session);
    }
    console.log(`[sessions] restored ${sessions.size} from disk`);
  } catch (err) {
    console.warn('[sessions] restore failed:', err instanceof Error ? err.message : err);
  }
}

restore();

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
  persist(true);
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
  const statusChanged = patch.status !== undefined && patch.status !== current.status;
  persist(statusChanged);
  return next;
}

export function setStatus(id: string, status: SessionStatus, error: string | null = null): SensingSession {
  return updateSession(id, { status, error });
}

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
