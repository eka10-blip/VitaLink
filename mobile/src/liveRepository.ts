import { Dashboard, DashboardRepository, Role } from './models';

// PROPOSED backend endpoints ONLY. They are NOT verified as existing in the team repo.
// The backend must enforce Supabase Auth + caregiver/patient ownership on every route.
// The mobile app must never embed API secrets or a Supabase service-role key.
const BASE = (process.env.EXPO_PUBLIC_VITALINK_API_URL ?? '').replace(/\/$/, '');
let getToken: (() => Promise<string | null>) | undefined;

/** Call from your team's Supabase Auth integration after it is implemented. */
export function setAccessTokenProvider(provider: () => Promise<string | null>) {
  getToken = provider;
}
async function request<T>(method: string, path: string): Promise<T> {
  if (!BASE) throw new Error('Live API URL is not configured');
  if (!getToken) throw new Error('Authentication is not connected. Use Demo mode until it is.');
  const token = await getToken();
  if (!token) throw new Error('Please sign in before loading health information.');
  const response = await fetch(`${BASE}${path}`, {
    method,
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/json', ...(method !== 'GET' ? { 'Content-Type': 'application/json' } : {}) },
  });
  if (!response.ok) throw new Error(`Server request failed (${response.status})`);
  if (response.status === 204) return undefined as T;
  return response.json() as Promise<T>;
}
export async function fetchLiveRole(): Promise<Role> {
  const { role } = await request<{ role: Role }>('GET', '/v1/me');
  if (role !== 'patient' && role !== 'caregiver') throw new Error('No authorized app role was returned.');
  return role;
}

export const liveRepository: DashboardRepository = {
  mode: 'live',
  load(role: Role) { return request<Dashboard>('GET', role === 'patient' ? '/v1/patient/dashboard' : '/v1/caregiver/dashboard'); },
  async startCheckIn() { await request('POST', '/v1/checkins/start'); },
  async acknowledgeAlert(id: string) { await request('PATCH', `/v1/alerts/${encodeURIComponent(id)}/acknowledge`); },
};
export const hasLiveUrl = Boolean(BASE);
