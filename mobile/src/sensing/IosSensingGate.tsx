import React, { useEffect, useState } from 'react';
import { Platform, StyleSheet, Text } from 'react-native';
import { Panel, Pill } from '../ui';
import { colors } from '../theme';
import type { SensingSessionSnapshot } from './types';

type Props = {
  patientId: string;
  onComplete?: (snapshot: SensingSessionSnapshot) => void;
};

/**
 * Lazily loads LiveKit-backed sensing so Expo Go / Android / web do not crash
 * when @livekit/react-native native code is missing.
 */
export function IosSensingGate({ patientId, onComplete }: Props) {
  const [Session, setSession] = useState<React.ComponentType<Props> | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    if (Platform.OS !== 'ios') return;
    let cancelled = false;
    void import('./IosSensingSession')
      .then((mod) => {
        if (!cancelled) setSession(() => mod.IosSensingSession);
      })
      .catch((err) => {
        if (!cancelled) {
          setLoadError(err instanceof Error ? err.message : String(err));
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (Platform.OS !== 'ios') {
    return (
      <Panel>
        <Pill text="PERSON 2 · IOS ONLY" tone="orange" />
        <Text style={styles.title}>Camera sensing</Text>
        <Text style={styles.body}>LiveKit camera publish + Presage sensing is wired for iOS development builds only.</Text>
      </Panel>
    );
  }

  if (loadError) {
    return (
      <Panel>
        <Pill text="PERSON 2 · BUILD REQUIRED" tone="orange" />
        <Text style={styles.title}>LiveKit not available</Text>
        <Text style={styles.body}>
          Use an iOS dev client (`npx expo run:ios`). Expo Go cannot load LiveKit native modules.
        </Text>
        <Text style={styles.hint}>{loadError}</Text>
      </Panel>
    );
  }

  if (!Session) {
    return (
      <Panel>
        <Pill text="PERSON 2" />
        <Text style={styles.title}>Loading sensing module…</Text>
      </Panel>
    );
  }

  return <Session patientId={patientId} onComplete={onComplete} />;
}

const styles = StyleSheet.create({
  title: { fontSize: 17, color: colors.ink, fontWeight: '800', marginTop: 12, marginBottom: 6 },
  body: { color: colors.muted, fontSize: 14, lineHeight: 21, marginBottom: 8 },
  hint: { fontSize: 11, color: colors.muted, lineHeight: 16 },
});
