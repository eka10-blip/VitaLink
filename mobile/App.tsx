import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Alert as NativeAlert, Linking, Platform, Pressable, SafeAreaView, ScrollView, StatusBar, StyleSheet, Text, View } from 'react-native';
import { Dashboard, Role, Alert as CareAlert, Metric } from './src/models';
import { demoRepository } from './src/demoRepository';
import { fetchLiveRole, hasLiveUrl, liveRepository } from './src/liveRepository';
import { Action, Empty, Label, MetricCard, Panel, Pill, SectionHeader } from './src/ui';
import { colors } from './src/theme';

const repository = hasLiveUrl ? liveRepository : demoRepository;
const isDemo = repository.mode === 'demo';
// Managed Chert FaceTime line confirmed by the team. Keep the country code for iOS.
// The agent/Chert bridge must be online before the call can reach the AI.
const CHERT_FACETIME_NUMBER = '+12064655399';
const CHERT_DISPLAY_NUMBER = '(206) 465-5399';
async function callVitaLinkAI() {
  if (Platform.OS !== 'ios' || Platform.isPad) {
    NativeAlert.alert('iPhone required', 'VitaLink AI FaceTime calls are available on iPhone only.');
    return;
  }
  try {
    // Opens Apple's FaceTime app; it does not place an in-app LiveKit call.
    await Linking.openURL(`facetime://${CHERT_FACETIME_NUMBER}`);
  } catch {
    NativeAlert.alert('Unable to open FaceTime', `Check that FaceTime is available on your iPhone. You can also try calling ${CHERT_DISPLAY_NUMBER} in FaceTime.`);
  }
}
const formatDate = (iso: string | null) => iso ? new Date(iso).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }) : 'Not available';
const metricText = (metric: Metric) => metric.value == null || metric.quality === 'unavailable' ? '—' : String(metric.value);
const tabsPatient = ['Home', 'Check-in', 'Reports'] as const;
const tabsCaregiver = ['Overview', 'Alerts', 'Reports'] as const;
type PatientTab = typeof tabsPatient[number];
type CareTab = typeof tabsCaregiver[number];

function EventRow({ title, sub, right, danger = false }: { title: string; sub: string; right?: string; danger?: boolean }) {
  return <View style={styles.rowItem}>
    <View style={[styles.rowDot, { backgroundColor: danger ? colors.red : colors.green }]} />
    <View style={{ flex: 1 }}><Text style={styles.rowTitle}>{title}</Text><Text style={styles.rowSub}>{sub}</Text></View>
    {right ? <Text style={styles.rowRight}>{right}</Text> : null}
  </View>;
}
function MeasurementSummary({ data }: { data: Dashboard }) {
  const source = isDemo ? 'Synthetic sample data' : 'Latest recorded measurements';
  return <>
    <SectionHeader title="Latest measurements" extra={source} />
    <View style={{ flexDirection: 'row', gap: 10 }}>
      <MetricCard title="♥  Heart rate" value={metricText(data.pulse)} unit="bpm" sub={data.pulse.value == null ? 'Waiting for measurement' : formatDate(data.pulse.measuredAt)} accent="green" />
      <MetricCard title="〰  Breathing rate" value={metricText(data.breathing)} unit="/min" sub={data.breathing.value == null ? 'Waiting for measurement' : formatDate(data.breathing.measuredAt)} accent="blue" />
    </View>
    <Text style={styles.microcopy}>Camera estimates may be unavailable or inaccurate. These values are not a diagnosis or emergency monitoring service.</Text>
  </>;
}
function PatientHome({ data, onCheckIn, onCallAI }: { data: Dashboard; onCheckIn: () => void; onCallAI: () => void }) {
  const activeAlerts = data.alerts.filter(a => !a.acknowledged);
  return <>
    <View style={styles.welcome}><Text style={styles.greeting}>Good to see you,</Text><Text style={styles.name}>{data.patientName.split(' ')[0]} <Text style={{ color: colors.green }}>✳</Text></Text><Text style={styles.subtitle}>A little check-in can go a long way.</Text></View>
    <Panel style={{ backgroundColor: '#EAF6F0', borderColor: '#DBEEE4' }}>
      <View style={styles.line}><Pill text="YOUR DAILY CHECK-IN" /><Text style={{ color: colors.green, fontSize: 20 }}>✦</Text></View>
      <Text style={styles.heroTitle}>How are you feeling today?</Text>
      <Text style={styles.heroSub}>Check in at your pace and share an update with your care team.</Text>
      <Action label={isDemo ? 'Try a demo check-in  →' : 'Start check-in  →'} onPress={onCheckIn} />
    </Panel>
    <Panel style={{ backgroundColor: '#EAF3FF', borderColor: '#DCE9F9' }}>
      <Pill text="VIDEO CALL" tone="blue" />
      <Text style={styles.cardTitle}>Talk with your AI companion</Text>
      <Text style={styles.body}>Open FaceTime to speak with the VitaLink AI caregiver. Your care team must have the Chert agent running.</Text>
      <Action label="Call VitaLink AI on FaceTime  →" onPress={onCallAI} />
      <Text style={styles.microcopy}>FaceTime number: {CHERT_DISPLAY_NUMBER}. The call opens outside VitaLink.</Text>
    </Panel>
    <MeasurementSummary data={data} />
    <SectionHeader title="Your care connection" />
    <Panel><EventRow title={data.caregiverName} sub="Linked family caregiver" right={data.linked ? 'Connected' : 'Unlinked'} /><View style={{ height: 1, backgroundColor: colors.border, marginVertical: 12 }}/><EventRow title="Latest update" sub={formatDate(data.lastUpdated)} right="Shared" />{activeAlerts.length > 0 ? <Text style={styles.warningText}>{activeAlerts.length} check-in alert(s) need follow-up.</Text> : null}</Panel>
    <Text style={styles.notice}>Prototype only. Not for diagnosis or emergency response. If you believe you are experiencing an emergency, contact local emergency services.</Text>
  </>;
}
function PatientCheckIn({ data, onCheckIn, onSimulate, onCallAI, busy }: { data: Dashboard; onCheckIn: () => void; onSimulate: () => void; onCallAI: () => void; busy: boolean }) {
  return <>
    <Text style={styles.screenTitle}>Daily check-in</Text><Text style={styles.screenSub}>A simple process, with you in control.</Text>
    <Panel><Pill text="STEP 1" /><Text style={styles.cardTitle}>Camera measurements</Text><Text style={styles.body}>Your teammate's Presage + LiveKit system will provide heart and breathing estimates. The interface displays only returned measurements and their status.</Text><View style={styles.statLine}><Text style={styles.statLabel}>Heart rate</Text><Text style={styles.statValue}>{metricText(data.pulse)} bpm</Text></View><View style={styles.statLine}><Text style={styles.statLabel}>Breathing rate</Text><Text style={styles.statValue}>{metricText(data.breathing)} /min</Text></View></Panel>
    <Panel><Pill text="STEP 2" tone="blue" /><Text style={styles.cardTitle}>FaceTime conversation</Text><Text style={styles.body}>Call the Chert AI caregiver using Apple's FaceTime app. When the agent is running, it can respond through the FaceTime bridge. Calls and transcripts are managed by the teammate's backend, not this screen.</Text><Action label="Call VitaLink AI on FaceTime  →" onPress={onCallAI} /><Text style={styles.microcopy}>Calls {CHERT_DISPLAY_NUMBER} through FaceTime. This button does not itself record a check-in or generate a report.</Text></Panel>
    <Panel><Pill text="STEP 3" /><Text style={styles.cardTitle}>Shared update</Text><Text style={styles.body}>Gemini + Supabase will generate the patient-friendly and caregiver summaries. Both appear in their respective Reports tabs.</Text><Action label={busy ? 'Saving…' : isDemo ? 'Complete sample check-in' : 'Request live check-in'} disabled={busy} onPress={onCheckIn} /></Panel>
    {isDemo ? <Panel style={{ borderColor: '#F9D8CF' }}><Text style={styles.cardTitle}>Emergency-flow demonstration</Text><Text style={styles.body}>Trigger an explicitly simulated nonresponse event to show how it appears on the family dashboard.</Text><Action label="Simulate no-response alert" danger disabled={busy} onPress={onSimulate} /></Panel> : null}
  </>;
}
function ReportScreen({ data, role }: { data: Dashboard; role: Role }) {
  return <>
    <Text style={styles.screenTitle}>Health reports</Text><Text style={styles.screenSub}>Summaries from your latest check-in.</Text>
    {data.report ? <Panel><View style={styles.line}><Pill text="LATEST REPORT" /><Label>{formatDate(data.report.createdAt)}</Label></View><Text style={styles.cardTitle}>{role === 'patient' ? 'Your check-in summary' : 'Caregiver summary'}</Text><Text style={styles.body}>{role === 'patient' ? data.report.patientSummary : data.report.caregiverSummary}</Text><Text style={styles.microcopy}>{isDemo ? 'This is sample text, not a generated medical interpretation.' : 'AI-assisted summary. Verify important information with a qualified professional.'}</Text></Panel> : <Empty title="No report yet" description="A report will show here when your teammate's Gemini + Supabase flow writes one." />}
    <SectionHeader title="Previous check-ins" />
    <Panel>{data.checkIns.length === 0 ? <Text style={styles.body}>No check-ins have been recorded yet.</Text> : data.checkIns.slice(0, 8).map((c, idx) => <View key={c.id}>{idx ? <View style={styles.separator}/> : null}<EventRow title={formatDate(c.timestamp)} sub={c.note} right={c.state === 'completed' ? 'Complete' : 'Follow-up'} danger={c.state !== 'completed'} /></View>)}</Panel>
    <Text style={styles.notice}>Reports are for communication and demonstration, not medical advice. No clinical decision should rely solely on an AI-generated summary.</Text>
  </>;
}
function CaregiverHome({ data, onAlerts }: { data: Dashboard; onAlerts: () => void }) {
  const pending = data.alerts.filter(a => !a.acknowledged);
  return <>
    <View style={styles.welcome}><Text style={styles.greeting}>Family dashboard</Text><Text style={styles.name}>Stay connected <Text style={{ color: colors.green }}>♥</Text></Text><Text style={styles.subtitle}>Updates from your loved one's daily care.</Text></View>
    <Panel><View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}><View style={styles.avatar}><Text style={{ color: colors.green, fontSize: 21, fontWeight: '800' }}>EC</Text></View><View style={{ flex: 1 }}><Text style={styles.cardTitle}>{data.patientName}</Text><Text style={styles.body}>Last update {formatDate(data.lastUpdated)}</Text></View><Pill text="CONNECTED" /></View></Panel>
    <MeasurementSummary data={data} />
    <SectionHeader title="Attention center" extra={`${pending.length} awaiting review`} />
    <Panel style={pending.length > 0 ? { borderColor: '#F1C4C5' } : undefined}><Text style={[styles.cardTitle, { color: pending.length ? colors.red : colors.green }]}>{pending.length ? `${pending.length} follow-up alert${pending.length === 1 ? '' : 's'}` : 'All caught up'}</Text><Text style={styles.body}>{pending.length ? pending[0].detail : 'No unanswered alerts are currently recorded.'}</Text><Action label="View alerts →" onPress={onAlerts} secondary /></Panel>
    <SectionHeader title="Most recent check-ins" />
    <Panel>{data.checkIns.slice(0, 3).map((c, idx) => <View key={c.id}>{idx ? <View style={styles.separator}/> : null}<EventRow title={formatDate(c.timestamp)} sub={c.note} right={c.state === 'completed' ? 'Done' : 'Follow-up'} /></View>)}</Panel>
  </>;
}
function CaregiverAlerts({ data, onAcknowledge, busy }: { data: Dashboard; onAcknowledge: (id: string) => void; busy: boolean }) {
  return <>
    <Text style={styles.screenTitle}>Care alerts</Text><Text style={styles.screenSub}>Check-in events that may need personal follow-up.</Text>
    {data.alerts.length === 0 ? <Empty title="No alerts right now" description="If a check-in escalation is recorded by the backend, it will appear here." /> : data.alerts.map((a: CareAlert) => <Panel key={a.id}><View style={styles.line}><Pill text={a.acknowledged ? 'REVIEWED' : 'NEEDS REVIEW'} tone={a.acknowledged ? 'green' : 'red'} />{a.simulated ? <Pill text="SIMULATION" tone="orange" /> : null}</View><Text style={styles.cardTitle}>{a.title}</Text><Text style={styles.body}>{a.detail}</Text><Label style={{ marginTop: 10, marginBottom: 12 }}>{formatDate(a.createdAt)}</Label>{!a.acknowledged ? <Action label={busy ? 'Updating…' : 'Mark as reviewed'} onPress={() => onAcknowledge(a.id)} disabled={busy} /> : null}</Panel>)}
    <Text style={styles.notice}>Marking an alert reviewed is not equivalent to checking on someone or contacting emergency services.</Text>
  </>;
}

function VitaLinkApp() {
  const [role, setRole] = useState<Role>('patient');
  const [roleReady, setRoleReady] = useState(isDemo);
  const [patientTab, setPatientTab] = useState<PatientTab>('Home');
  const [caregiverTab, setCaregiverTab] = useState<CareTab>('Overview');
  const [data, setData] = useState<Dashboard | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const refresh = useCallback(async () => {
    try {
      const result = await repository.load(role);
      setData(result); setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to load dashboard');
      setData(null); // No synthetic fallback when real data cannot be loaded.
    } finally { setLoading(false); }
  }, [role]);
  useEffect(() => {
    if (isDemo) return;
    fetchLiveRole().then((authorizedRole) => { setRole(authorizedRole); setRoleReady(true); })
      .catch((e) => { setError(e instanceof Error ? e.message : 'Sign-in required'); setLoading(false); });
  }, []);
  useEffect(() => {
    if (!roleReady) return;
    setLoading(true); refresh();
    const interval = setInterval(refresh, 15000);
    return () => clearInterval(interval);
  }, [refresh, roleReady]);
  const perform = async (action: () => Promise<void>, confirmation: string) => {
    setBusy(true);
    try { await action(); await refresh(); NativeAlert.alert('VitaLink', confirmation); }
    catch (e) { NativeAlert.alert('Could not complete action', e instanceof Error ? e.message : 'Please try again'); }
    finally { setBusy(false); }
  };
  const start = () => perform(() => repository.startCheckIn(), isDemo ? 'A fictional check-in was added. Switch to the caregiver dashboard to see it.' : 'Check-in requested. Please follow the instructions from your care team.');
  const simulate = () => {
    if (!repository.simulateAlert) return;
    return perform(() => repository.simulateAlert!(), 'Simulated alert added. Switch to the caregiver dashboard to see it.');
  };
  const tabs = role === 'patient' ? tabsPatient : tabsCaregiver;
  const activeTab = role === 'patient' ? patientTab : caregiverTab;
  return <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg }}><StatusBar barStyle="dark-content" backgroundColor={colors.bg} />
    <View style={styles.topbar}><View style={{ flexDirection: 'row', alignItems: 'center', gap: 9 }}><View style={styles.brandIcon}><Text style={{ fontSize: 19, color: '#FFF', fontWeight: '900' }}>♥</Text></View><Text style={styles.brand}>Vita<Text style={{ color: colors.green }}>Link</Text></Text></View><Pill text={isDemo ? 'DEMO · FICTIONAL' : 'LIVE DATA'} tone={isDemo ? 'orange' : 'green'} /></View>
    {isDemo ? <View style={styles.roleSwitch}><Pressable accessibilityRole="button" accessibilityLabel="Open patient view" onPress={() => setRole('patient')} style={[styles.roleButton, role === 'patient' && styles.roleActive]}><Text style={[styles.roleText, role === 'patient' && styles.roleTextActive]}>Patient view</Text></Pressable><Pressable accessibilityRole="button" accessibilityLabel="Open caregiver view" onPress={() => setRole('caregiver')} style={[styles.roleButton, role === 'caregiver' && styles.roleActive]}><Text style={[styles.roleText, role === 'caregiver' && styles.roleTextActive]}>Family dashboard</Text></Pressable></View> : null}
    {error ? <View style={styles.error}><Text style={{ color: colors.red, fontWeight: '800' }}>Connection unavailable</Text><Text style={{ color: colors.ink, marginVertical: 7 }}>{error}</Text><Action label="Try again" onPress={refresh} secondary /></View> : null}
    {loading && !data ? <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}><ActivityIndicator color={colors.green} size="large" /><Text style={{ marginTop: 12, color: colors.muted }}>Loading your dashboard…</Text></View> : data ? <ScrollView style={{ flex: 1 }} contentContainerStyle={styles.scroll} showsVerticalScrollIndicator={false}>
      {role === 'patient' && patientTab === 'Home' ? <PatientHome data={data} onCheckIn={() => setPatientTab('Check-in')} onCallAI={callVitaLinkAI} /> : null}
      {role === 'patient' && patientTab === 'Check-in' ? <PatientCheckIn data={data} onCheckIn={start} onSimulate={simulate} onCallAI={callVitaLinkAI} busy={busy} /> : null}
      {role === 'patient' && patientTab === 'Reports' ? <ReportScreen data={data} role={role} /> : null}
      {role === 'caregiver' && caregiverTab === 'Overview' ? <CaregiverHome data={data} onAlerts={() => setCaregiverTab('Alerts')} /> : null}
      {role === 'caregiver' && caregiverTab === 'Alerts' ? <CaregiverAlerts data={data} onAcknowledge={(id) => perform(() => repository.acknowledgeAlert(id), 'Alert marked as reviewed.')} busy={busy} /> : null}
      {role === 'caregiver' && caregiverTab === 'Reports' ? <ReportScreen data={data} role={role} /> : null}
      <Pressable onPress={refresh} style={{ alignSelf: 'center', paddingVertical: 12 }}><Text style={{ color: colors.green, fontWeight: '700' }}>↻ Refresh updates</Text></Pressable>
    </ScrollView> : <View style={{ flex: 1 }} />}
    <View style={styles.bottomNav}>{tabs.map((tab, i) => <Pressable accessibilityRole="tab" accessibilityState={{ selected: activeTab === tab }} accessibilityLabel={`${tab} tab`} key={tab} style={styles.navItem} onPress={() => role === 'patient' ? setPatientTab(tab as PatientTab) : setCaregiverTab(tab as CareTab)}><Text style={[styles.navIcon, activeTab === tab && { color: colors.green }]}>{i === 0 ? '⌂' : i === 1 ? (role === 'patient' ? '♡' : '⚑') : '▤'}</Text><Text style={[styles.navLabel, activeTab === tab && { color: colors.green, fontWeight: '800' }]}>{tab}</Text></Pressable>)}</View>
  </SafeAreaView>;
}
const styles = StyleSheet.create({
  topbar: { paddingHorizontal: 20, paddingTop: 14, paddingBottom: 10, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  brandIcon: { backgroundColor: colors.green, width: 35, height: 35, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  brand: { fontSize: 22, fontWeight: '900', color: colors.ink, letterSpacing: -0.6 },
  roleSwitch: { marginHorizontal: 20, backgroundColor: '#E8EFEB', borderRadius: 13, padding: 4, flexDirection: 'row', marginBottom: 6 },
  roleButton: { flex: 1, alignItems: 'center', paddingVertical: 10, borderRadius: 11 },
  roleActive: { backgroundColor: '#FFFFFF' },
  roleText: { color: colors.muted, fontWeight: '700', fontSize: 13 },
  roleTextActive: { color: colors.green, fontWeight: '800' },
  scroll: { paddingHorizontal: 20, paddingBottom: 28, paddingTop: 14, maxWidth: 760, width: '100%', alignSelf: 'center' },
  welcome: { marginBottom: 22 },
  greeting: { color: colors.muted, fontSize: 15, fontWeight: '600' },
  name: { color: colors.ink, fontSize: 31, fontWeight: '900', letterSpacing: -0.8, marginTop: 4 },
  subtitle: { color: colors.muted, fontSize: 14, marginTop: 7 },
  heroTitle: { fontSize: 23, fontWeight: '900', color: colors.ink, marginTop: 17, lineHeight: 29 },
  heroSub: { fontSize: 14, lineHeight: 21, color: colors.muted, marginTop: 8, marginBottom: 18 },
  screenTitle: { fontSize: 27, fontWeight: '900', color: colors.ink, marginBottom: 6 },
  screenSub: { color: colors.muted, fontSize: 14, marginBottom: 21 },
  cardTitle: { fontSize: 17, color: colors.ink, fontWeight: '800', marginTop: 12, marginBottom: 6 },
  body: { color: colors.muted, fontSize: 14, lineHeight: 21, marginBottom: 8 },
  microcopy: { fontSize: 11, color: colors.muted, lineHeight: 16, marginTop: 12, marginBottom: 7 },
  notice: { marginVertical: 9, fontSize: 11, color: colors.muted, lineHeight: 17 },
  line: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  rowItem: { flexDirection: 'row', gap: 11, alignItems: 'center', paddingVertical: 6 },
  rowDot: { width: 9, height: 9, borderRadius: 5 },
  rowTitle: { fontSize: 14, fontWeight: '800', color: colors.ink },
  rowSub: { fontSize: 12, color: colors.muted, marginTop: 3, lineHeight: 18 },
  rowRight: { fontSize: 11, fontWeight: '700', color: colors.green, maxWidth: 85, textAlign: 'right' },
  separator: { height: 1, backgroundColor: colors.border, marginVertical: 12 },
  warningText: { color: colors.red, fontSize: 12, fontWeight: '700', marginTop: 12 },
  statLine: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 11 },
  statLabel: { color: colors.muted, fontSize: 13 },
  statValue: { color: colors.ink, fontWeight: '800' },
  avatar: { height: 52, width: 52, borderRadius: 18, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.greenLight },
  error: { padding: 15, marginHorizontal: 20, borderRadius: 15, borderWidth: 1, borderColor: '#FFD4D6', backgroundColor: colors.redLight },
  bottomNav: { minHeight: 68, backgroundColor: '#FFFFFF', flexDirection: 'row', paddingTop: 8, paddingBottom: 10, borderTopWidth: 1, borderColor: colors.border },
  navItem: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  navIcon: { fontSize: 25, lineHeight: 28, color: '#8DA19A' },
  navLabel: { color: colors.muted, fontWeight: '600', fontSize: 11, marginTop: 2 },
});

// VitaLink is intentionally available on iPhone only.
// Expo's `platforms` setting controls supported builds; this is a runtime safeguard.
export default function App() {
  if (Platform.OS !== 'ios' || Platform.isPad) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: colors.bg, justifyContent: 'center', padding: 24 }}>
        <Text style={{ fontSize: 24, fontWeight: '800', color: colors.ink, marginBottom: 12 }}>VitaLink for iPhone</Text>
        <Text style={{ fontSize: 15, lineHeight: 23, color: colors.muted }}>This version of VitaLink is available on iPhone only.</Text>
      </SafeAreaView>
    );
  }
  return <VitaLinkApp />;
}
