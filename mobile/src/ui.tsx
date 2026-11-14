import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { colors } from './theme';

export function Label({ children, style }: { children: React.ReactNode; style?: any }) {
  return <Text style={[styles.label, style]}>{children}</Text>;
}
export function Panel({ children, style }: { children: React.ReactNode; style?: any }) {
  return <View style={[styles.panel, style]}>{children}</View>;
}
export function SectionHeader({ title, extra }: { title: string; extra?: string }) {
  return <View style={styles.section}><Text style={styles.sectionTitle}>{title}</Text>{extra ? <Text style={styles.extra}>{extra}</Text> : null}</View>;
}
export function Pill({ text, tone = 'green' }: { text: string; tone?: 'green' | 'blue' | 'orange' | 'red' }) {
  const map = { green: [colors.greenLight, colors.green], blue: [colors.blueLight, colors.blue], orange: [colors.peach, colors.orange], red: [colors.redLight, colors.red] };
  return <View style={[styles.pill, { backgroundColor: map[tone][0] }]}><Text style={{ color: map[tone][1], fontSize: 11, fontWeight: '800', letterSpacing: 0.3 }}>{text}</Text></View>;
}
export function Action({ label, onPress, secondary = false, disabled = false, danger = false }: { label: string; onPress: () => void; secondary?: boolean; disabled?: boolean; danger?: boolean }) {
  return <Pressable accessibilityRole="button" accessibilityLabel={label} disabled={disabled} onPress={onPress} style={({ pressed }) => [styles.action, secondary && styles.actionSecondary, danger && { backgroundColor: colors.red }, disabled && { opacity: 0.5 }, pressed && { opacity: 0.83 }]}><Text style={[styles.actionLabel, secondary && { color: colors.green }]}>{label}</Text></Pressable>;
}
export function MetricCard({ title, value, unit, sub, accent }: { title: string; value: string; unit: string; sub: string; accent: 'green' | 'blue' }) {
  return <View style={[styles.metric, { backgroundColor: accent === 'green' ? '#E8F7EF' : '#EAF3FF' }]}><Text style={{ fontSize: 13, color: colors.muted, fontWeight: '700' }}>{title}</Text><View style={{ flexDirection: 'row', alignItems: 'baseline', gap: 5, marginTop: 15 }}><Text style={styles.metricValue}>{value}</Text><Text style={{ fontSize: 12, color: colors.muted }}>{unit}</Text></View><Text style={{ fontSize: 11, color: colors.muted, marginTop: 13 }}>{sub}</Text></View>;
}
export function Empty({ title, description }: { title: string; description: string }) {
  return <Panel style={{ paddingVertical: 25 }}><Text style={{ fontSize: 16, fontWeight: '800', color: colors.ink }}>{title}</Text><Text style={{ fontSize: 13, color: colors.muted, lineHeight: 20, marginTop: 6 }}>{description}</Text></Panel>;
}
export const styles = StyleSheet.create({
  panel: { backgroundColor: colors.paper, borderWidth: 1, borderColor: colors.border, padding: 19, borderRadius: 20, marginBottom: 12 },
  label: { fontSize: 12, color: colors.muted, fontWeight: '600' },
  section: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: 13, marginBottom: 12 },
  sectionTitle: { fontSize: 18, fontWeight: '800', color: colors.ink },
  extra: { fontSize: 12, color: colors.green, fontWeight: '700' },
  pill: { alignSelf: 'flex-start', borderRadius: 30, paddingVertical: 6, paddingHorizontal: 10 },
  action: { backgroundColor: colors.green, borderRadius: 14, paddingHorizontal: 18, paddingVertical: 14, alignItems: 'center', justifyContent: 'center', minHeight: 48 },
  actionSecondary: { backgroundColor: colors.greenLight, borderColor: colors.green, borderWidth: 1 },
  actionLabel: { fontWeight: '800', color: '#FFFFFF', fontSize: 14 },
  metric: { flex: 1, borderRadius: 18, padding: 17, minHeight: 157 },
  metricValue: { fontSize: 35, color: colors.ink, fontWeight: '900' },
});
