import type { SensingSessionSnapshot } from './types';

const AGENT_BASE = (process.env.EXPO_PUBLIC_VITALINK_AGENT_URL ?? '').replace(/\/$/, '');

/**
 * Push completed Presage vitals into the Chert/FaceTime agent patient context
 * so the AI companion can acknowledge the scan during the call.
 * No-op when EXPO_PUBLIC_VITALINK_AGENT_URL is unset.
 */
export async function publishVitalsForChert(
  patientId: string,
  snapshot: SensingSessionSnapshot,
): Promise<void> {
  if (!AGENT_BASE) {
    console.log('[chert] agent URL not set — skipping vitals publish');
    return;
  }
  const body = {
    patient_id: patientId,
    latest_presage_vitals: {
      hr_bpm: snapshot.pulse.value,
      rr_bpm: snapshot.breathing.value,
      pulse_quality: snapshot.pulse.quality,
      breathing_quality: snapshot.breathing.quality,
      measured_at: snapshot.updatedAt,
      session_id: snapshot.id,
      source: 'presage',
      platform: 'ios',
    },
  };
  try {
    const response = await fetch(`${AGENT_BASE}/v1/patient-context`, {
      method: 'PUT',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!response.ok) {
      console.warn('[chert] patient-context publish failed', response.status);
    }
  } catch (err) {
    console.warn('[chert] patient-context publish error', err instanceof Error ? err.message : err);
  }
}
