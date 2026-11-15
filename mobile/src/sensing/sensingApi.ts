import type { SensingSessionSnapshot, StartSensingResponse } from './types';

const ENV_BASE = (process.env.EXPO_PUBLIC_PRESAGE_WORKER_URL ?? '').replace(/\/$/, '');

/**
 * Cloud (or explicit) worker base only.
 * No USB / LAN IP guessing — the app must talk to a public HTTPS backend.
 */
function candidateBases(): string[] {
  const list = [ENV_BASE];
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of list) {
    const base = (raw ?? '').trim().replace(/\/$/, '');
    if (!base || seen.has(base)) continue;
    seen.add(base);
    out.push(base);
  }
  return out;
}

let workerBase = ENV_BASE;

export function getWorkerBaseUrl(): string {
  return workerBase;
}

export function hasPresageWorkerConfigured(): boolean {
  return candidateBases().length > 0;
}

async function pingOne(base: string, timeoutMs = 8000): Promise<boolean> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    const response = await fetch(`${base}/health`, {
      method: 'GET',
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!response.ok) return false;
    const json = (await response.json()) as { ok?: boolean };
    return Boolean(json.ok);
  } catch {
    return false;
  }
}

/** Probe the configured cloud worker and lock the base URL. */
export async function discoverWorker(): Promise<string> {
  const candidates = candidateBases();
  if (candidates.length === 0) {
    throw new Error(
      'Presage backend URL is not set. Rebuild with EXPO_PUBLIC_PRESAGE_WORKER_URL pointing at the cloud worker.',
    );
  }

  const ordered = workerBase
    ? [workerBase, ...candidates.filter((c) => c !== workerBase)]
    : candidates;

  const results = await Promise.all(
    ordered.map(async (base) => ({ base, ok: await pingOne(base) })),
  );
  const hit = results.find((r) => r.ok);
  if (!hit) {
    throw new Error(
      'Could not reach the Presage cloud backend. Check that the worker is deployed and EXPO_PUBLIC_PRESAGE_WORKER_URL is correct.',
    );
  }
  workerBase = hit.base;
  console.log('[sensing] using worker', workerBase);
  return workerBase;
}

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  if (!workerBase) {
    await discoverWorker();
  }
  let response: Response;
  try {
    response = await fetch(`${workerBase}${path}`, {
      method,
      headers: {
        Accept: 'application/json',
        ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
  } catch (e) {
    await discoverWorker();
    try {
      response = await fetch(`${workerBase}${path}`, {
        method,
        headers: {
          Accept: 'application/json',
          ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        },
        body: body !== undefined ? JSON.stringify(body) : undefined,
      });
    } catch (e2) {
      const message = e2 instanceof Error ? e2.message : String(e2);
      throw new Error(`Cannot reach Presage cloud backend (${message}).`);
    }
  }
  if (!response.ok) {
    let detail = `HTTP ${response.status}`;
    try {
      const json = (await response.json()) as { error?: string };
      if (json.error) detail = typeof json.error === 'string' ? json.error : detail;
    } catch {
      /* ignore */
    }
    throw new Error(detail);
  }
  return response.json() as Promise<T>;
}

export function startSensingSession(patientId: string): Promise<StartSensingResponse> {
  return request<StartSensingResponse>('POST', '/v1/sensing/sessions', { patientId });
}

export function getSensingSession(sessionId: string): Promise<SensingSessionSnapshot> {
  return request<SensingSessionSnapshot>('GET', `/v1/sensing/sessions/${encodeURIComponent(sessionId)}`);
}

export function cancelSensingSession(sessionId: string): Promise<SensingSessionSnapshot> {
  return request<SensingSessionSnapshot>('POST', `/v1/sensing/sessions/${encodeURIComponent(sessionId)}/cancel`);
}
