export type MetricSource = 'presage' | 'demo';
export type MetricQuality = 'good' | 'limited' | 'unavailable';
export type Metric = {
  value: number | null;
  unit: string;
  source: MetricSource;
  quality: MetricQuality;
  measuredAt: string | null;
};

export type CheckInState = 'completed' | 'needs-follow-up' | 'pending';
export type CheckIn = {
  id: string;
  timestamp: string;
  state: CheckInState;
  note: string;
  pulse: number | null;
  breathing: number | null;
};
export type Alert = {
  id: string;
  createdAt: string;
  kind: 'unanswered-check-in' | 'simulated-fall' | 'manual-request';
  title: string;
  detail: string;
  acknowledged: boolean;
  simulated: boolean;
};
export type Report = { createdAt: string; patientSummary: string; caregiverSummary: string };
export type Dashboard = {
  patientId: string;
  patientName: string;
  caregiverName: string;
  lastUpdated: string;
  pulse: Metric;
  breathing: Metric;
  checkIns: CheckIn[];
  alerts: Alert[];
  report: Report | null;
  linked: boolean;
};
export type Role = 'patient' | 'caregiver';
export interface DashboardRepository {
  mode: 'demo' | 'live';
  load(role: Role): Promise<Dashboard>;
  startCheckIn(): Promise<void>;
  acknowledgeAlert(id: string): Promise<void>;
  simulateAlert?(): Promise<void>;
}
