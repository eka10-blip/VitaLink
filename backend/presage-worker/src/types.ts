/** Matches Person 4 INTEGRATION_CONTRACT metric shape. */
export type MetricQuality = 'good' | 'limited' | 'unavailable';

export type MetricReading = {
  value: number | null;
  unit: string;
  source: 'presage';
  quality: MetricQuality;
  measuredAt: string | null;
  confidence: number | null;
};

export type SessionStatus =
  | 'pending'
  | 'waiting_for_video'
  | 'measuring'
  | 'completed'
  | 'failed'
  | 'cancelled';

export type SensingSession = {
  id: string;
  patientId: string;
  roomName: string;
  status: SessionStatus;
  createdAt: string;
  updatedAt: string;
  error: string | null;
  validationHint: string | null;
  pulse: MetricReading;
  breathing: MetricReading;
  framesAccepted: number;
  framesRejected: number;
  /** Worker successfully joined the LiveKit room (no publisher required). */
  workerConnected: boolean;
  /** Worker subscribed to a remote video track (phone camera). */
  videoTrackSubscribed: boolean;
  /** Phone participant identity (never a token). */
  participantIdentity: string | null;
  /** Worker participant identity (never a token). */
  workerIdentity: string | null;
};

export type StartSessionRequest = {
  patientId?: string;
  /** Optional stable room name; default is derived from patientId + session id */
  roomName?: string;
};

export type StartSessionResponse = {
  sessionId: string;
  roomName: string;
  livekitUrl: string;
  /** Short-lived token for the iOS patient publisher */
  participantToken: string;
  participantIdentity: string;
  status: SessionStatus;
};

export function emptyMetric(unit: string): MetricReading {
  return {
    value: null,
    unit,
    source: 'presage',
    quality: 'unavailable',
    measuredAt: null,
    confidence: null,
  };
}
