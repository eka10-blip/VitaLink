export type SensingMetric = {
  value: number | null;
  unit: string;
  source: 'presage';
  quality: 'good' | 'limited' | 'unavailable';
  measuredAt: string | null;
  confidence: number | null;
};

export type SensingSessionStatus =
  | 'pending'
  | 'waiting_for_video'
  | 'measuring'
  | 'completed'
  | 'failed'
  | 'cancelled';

export type StartSensingResponse = {
  sessionId: string;
  roomName: string;
  livekitUrl: string;
  participantToken: string;
  participantIdentity: string;
  status: SensingSessionStatus;
};

export type SensingSessionSnapshot = {
  id: string;
  patientId: string;
  roomName: string;
  status: SensingSessionStatus;
  error: string | null;
  validationHint: string | null;
  pulse: SensingMetric;
  breathing: SensingMetric;
  framesAccepted: number;
  framesRejected: number;
  updatedAt: string;
  workerConnected?: boolean;
  videoTrackSubscribed?: boolean;
  participantIdentity?: string | null;
  workerIdentity?: string | null;
};
