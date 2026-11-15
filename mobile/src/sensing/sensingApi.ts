import type { SensingSessionSnapshot, StartSensingResponse } from './types';

const BASE = (process.env.EXPO_PUBLIC_PRESAGE_WORKER_URL ?? '').replace(/\/$/, '');

export const hasPresageWorker = Boolean(BASE);

async function request<T>(method: string, path: string, body?: unknown): Promise<T> {
  if (!BASE) {
    throw new Error('Set EXPO_PUBLIC_PRESAGE_WORKER_URL to the Person 2 worker (e.g. http://localhost:8787).');
  }
  const response = await fetch(`${BASE}${path}`, {
    method,
    headers: {
      Accept: 'application/json',
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
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
