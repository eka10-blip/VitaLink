import { Alert, Dashboard, DashboardRepository, Role } from './models';

const minutesAgo = (m: number) => new Date(Date.now() - m * 60000).toISOString();
const daysAgo = (d: number) => new Date(Date.now() - d * 86400000).toISOString();
const original: Dashboard = {
  patientId: 'fictional-patient-001',
  patientName: 'Evelyn Carter',
  caregiverName: 'Jordan Carter',
  lastUpdated: minutesAgo(8),
  pulse: { value: 72, unit: 'bpm', source: 'demo', quality: 'good', measuredAt: minutesAgo(8) },
  breathing: { value: 16, unit: 'breaths/min', source: 'demo', quality: 'good', measuredAt: minutesAgo(8) },
  linked: true,
  checkIns: [
    { id: 'c1', timestamp: minutesAgo(8), state: 'completed', note: 'Feeling well today.', pulse: 72, breathing: 16 },
    { id: 'c2', timestamp: daysAgo(1), state: 'completed', note: 'Completed daily check-in.', pulse: 74, breathing: 16 },
    { id: 'c3', timestamp: daysAgo(2), state: 'completed', note: 'Completed daily check-in.', pulse: 71, breathing: 17 },
    { id: 'c4', timestamp: daysAgo(3), state: 'completed', note: 'Completed daily check-in.', pulse: 73, breathing: 16 },
  ],
  alerts: [],
  report: {
    createdAt: minutesAgo(8),
    patientSummary: 'Your latest demo check-in was completed. Your sample measurements have been saved, and your care team can view the update.',
    caregiverSummary: 'Evelyn completed today’s sample check-in and reported feeling well. Recorded demo measurements: pulse 72 bpm, breathing 16/min. No unresolved check-in alerts.',
  },
};
let state: Dashboard = JSON.parse(JSON.stringify(original)) as Dashboard;
const sleep = () => new Promise<void>((resolve) => setTimeout(resolve, 180));

export const demoRepository: DashboardRepository = {
  mode: 'demo',
  async load(_role: Role) {
    await sleep();
    return JSON.parse(JSON.stringify(state)) as Dashboard;
  },
  async startCheckIn() {
    const now = new Date().toISOString();
    state = {
      ...state,
      lastUpdated: now,
      pulse: { value: 75, unit: 'bpm', source: 'demo', quality: 'good', measuredAt: now },
      breathing: { value: 17, unit: 'breaths/min', source: 'demo', quality: 'good', measuredAt: now },
      checkIns: [{ id: `check-${Date.now()}`, timestamp: now, state: 'completed', note: 'Simulated check-in completed.', pulse: 75, breathing: 17 }, ...state.checkIns].slice(0, 12),
      report: {
        createdAt: now,
        patientSummary: 'A sample check-in was recorded. These are fictional demonstration measurements, not camera readings.',
        caregiverSummary: 'A new simulated check-in was completed. Sample pulse: 75 bpm; breathing: 17/min. No clinical conclusions are implied.',
      },
    };
    await sleep();
  },
  async acknowledgeAlert(id: string) {
    state = { ...state, alerts: state.alerts.map((a) => a.id === id ? { ...a, acknowledged: true } : a) };
    await sleep();
  },
  async simulateAlert() {
    const alert: Alert = {
      id: `alert-${Date.now()}`,
      createdAt: new Date().toISOString(),
      kind: 'simulated-fall',
      title: 'Simulated fall follow-up',
      detail: 'Test scenario: the patient did not respond to the follow-up question. No real fall was detected.',
      acknowledged: false,
      simulated: true,
    };
    state = { ...state, alerts: [alert, ...state.alerts], lastUpdated: alert.createdAt };
    await sleep();
  },
};
