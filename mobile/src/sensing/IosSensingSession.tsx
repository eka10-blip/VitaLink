import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Platform, StyleSheet, Text, View } from 'react-native';
import {
  AudioSession,
  LiveKitRoom,
  VideoTrack,
  useTracks,
  isTrackReference,
  type TrackReferenceOrPlaceholder,
} from '@livekit/react-native';
import { Track } from 'livekit-client';
import { Action, Panel, Pill } from '../ui';
import { colors } from '../theme';
import {
  cancelSensingSession,
  getSensingSession,
  hasPresageWorker,
  startSensingSession,
} from './sensingApi';
import type { SensingSessionSnapshot, StartSensingResponse } from './types';

type Props = {
  patientId: string;
  onComplete?: (snapshot: SensingSessionSnapshot) => void;
};

function LocalPreview() {
  const tracks = useTracks([Track.Source.Camera]);
  const local = tracks.find((t: TrackReferenceOrPlaceholder) => isTrackReference(t) && t.participant.isLocal);
  if (!local || !isTrackReference(local)) {
    return <Text style={styles.hint}>Waiting for camera…</Text>;
  }
  return <VideoTrack trackRef={local} style={styles.preview} objectFit="cover" />;
}

/**
 * iOS-only Person 2 sensing panel.
 * Publishes the front camera to LiveKit; worker subscribes (Presage stays mock in Phase 2).
 */
export function IosSensingSession({ patientId, onComplete }: Props) {
  const [sessionCreds, setSessionCreds] = useState<StartSensingResponse | null>(null);
  const [snapshot, setSnapshot] = useState<SensingSessionSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [roomConnectHint, setRoomConnectHint] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPolling = () => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  };

  const start = useCallback(async () => {
    if (Platform.OS !== 'ios') {
      setError('Camera sensing is implemented for iOS only in this Person 2 delivery.');
      return;
    }
    if (!hasPresageWorker) {
      setError('EXPO_PUBLIC_PRESAGE_WORKER_URL is not set.');
      return;
    }
    setBusy(true);
    setError(null);
    setRoomConnectHint(null);
    try {
      const started = await startSensingSession(patientId);
      if (!started.livekitUrl || !started.participantToken) {
        setError('Worker did not return a LiveKit URL/token. Check LIVEKIT_* on the worker.');
        return;
      }
      // Never log the token.
      console.log('[sensing] session started', {
        sessionId: started.sessionId,
        roomName: started.roomName,
        participantIdentity: started.participantIdentity,
        livekitUrlPresent: Boolean(started.livekitUrl),
        tokenLength: started.participantToken.length,
      });
      setSessionCreds(started);
      setRoomConnectHint('Connecting phone to LiveKit room…');
      stopPolling();
      pollRef.current = setInterval(async () => {
        try {
          const next = await getSensingSession(started.sessionId);
          setSnapshot(next);
          if (next.error) {
            setError(next.error);
          }
          if (next.status === 'completed' || next.status === 'failed' || next.status === 'cancelled') {
            stopPolling();
            onComplete?.(next);
          }
        } catch (e) {
          setError(e instanceof Error ? e.message : 'Failed to poll sensing session');
        }
      }, 2000);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to start sensing');
    } finally {
      setBusy(false);
    }
  }, [patientId, onComplete]);

  const stop = useCallback(async () => {
    stopPolling();
    if (!sessionCreds) return;
    setBusy(true);
    try {
      const cancelled = await cancelSensingSession(sessionCreds.sessionId);
      setSnapshot(cancelled);
      setSessionCreds(null);
      setRoomConnectHint(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to cancel');
    } finally {
      setBusy(false);
    }
  }, [sessionCreds]);

  useEffect(() => () => stopPolling(), []);

  useEffect(() => {
    if (Platform.OS !== 'ios' || !sessionCreds) return;
    void AudioSession.startAudioSession()
      .then(() => setRoomConnectHint((h) => h ?? 'Audio session ready; publishing camera…'))
      .catch((e) => setError(e instanceof Error ? e.message : 'Audio session failed'));
    return () => {
      void AudioSession.stopAudioSession().catch(() => undefined);
    };
  }, [sessionCreds]);

  if (Platform.OS !== 'ios') {
    return (
      <Panel>
        <Pill text="PERSON 2 · IOS ONLY" tone="orange" />
        <Text style={styles.title}>Camera sensing</Text>
        <Text style={styles.body}>Presage + LiveKit sensing in this drop targets iOS development builds only.</Text>
      </Panel>
    );
  }

  const pulse = snapshot?.pulse;
  const breathing = snapshot?.breathing;

  return (
    <Panel>
      <Pill text="PERSON 2 · LIVEKIT (MOCK PRESAGE)" />
      <Text style={styles.title}>iOS camera → LiveKit</Text>
      <Text style={styles.body}>
        Phase 2: publish your front camera into a LiveKit room so the worker can subscribe. Heart/breathing stay
        unavailable until Phase 3 (Presage live).
      </Text>

      {!sessionCreds ? (
        <Action label={busy ? 'Starting…' : 'Start iOS sensing'} disabled={busy || !hasPresageWorker} onPress={start} />
      ) : (
        <>
          {sessionCreds.livekitUrl && sessionCreds.participantToken ? (
            <LiveKitRoom
              serverUrl={sessionCreds.livekitUrl}
              token={sessionCreds.participantToken}
              connect={true}
              audio={false}
              video={true}
              options={{
                adaptiveStream: { pixelDensity: 'screen' },
                videoCaptureDefaults: {
                  facingMode: 'user',
                  resolution: { width: 1280, height: 720, frameRate: 30 },
                },
              }}
              onConnected={() => {
                setRoomConnectHint('Phone connected to LiveKit room (publishing camera).');
                console.log('[sensing] phone LiveKitRoom connected', {
                  roomName: sessionCreds.roomName,
                  identity: sessionCreds.participantIdentity,
                });
              }}
              onDisconnected={() => {
                setRoomConnectHint('Phone disconnected from LiveKit room.');
              }}
              onError={(e: Error) => {
                setError(e.message);
                console.warn('[sensing] LiveKitRoom error', e.message);
              }}
            >
              <LocalPreview />
            </LiveKitRoom>
          ) : (
            <Text style={styles.hint}>Worker did not return LiveKit join credentials.</Text>
          )}

          <Text style={styles.meta}>Room: {sessionCreds.roomName}</Text>
          <Text style={styles.meta}>You: {sessionCreds.participantIdentity}</Text>
          <Text style={styles.meta}>Status: {snapshot?.status ?? sessionCreds.status}</Text>
          <Text style={styles.meta}>
            Worker in room: {snapshot?.workerConnected ? 'yes' : 'waiting…'}
          </Text>
          <Text style={styles.meta}>
            Video subscribed: {snapshot?.videoTrackSubscribed ? 'yes' : 'waiting…'}
          </Text>
          <Text style={styles.meta}>Frames received by worker: {snapshot?.framesAccepted ?? 0}</Text>
          {roomConnectHint ? <Text style={styles.hint}>{roomConnectHint}</Text> : null}
          {snapshot?.validationHint ? <Text style={styles.hint}>{snapshot.validationHint}</Text> : null}

          <View style={styles.stats}>
            <Text style={styles.stat}>
              Pulse: {pulse?.value == null ? '—' : `${pulse.value} bpm`} ({pulse?.quality ?? 'unavailable'})
            </Text>
            <Text style={styles.stat}>
              Breathing: {breathing?.value == null ? '—' : `${breathing.value}/min`} (
              {breathing?.quality ?? 'unavailable'})
            </Text>
          </View>
          <Action label={busy ? 'Stopping…' : 'Stop sensing'} danger disabled={busy} onPress={stop} />
        </>
      )}

      {error ? <Text style={styles.error}>{error}</Text> : null}
      {!hasPresageWorker ? (
        <Text style={styles.hint}>Set EXPO_PUBLIC_PRESAGE_WORKER_URL then rebuild the iOS dev client.</Text>
      ) : null}
      <Text style={styles.disclaimer}>
        Requires `npx expo run:ios` (not Expo Go). Wellness estimates only — not for diagnosis.
      </Text>
    </Panel>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 17, color: colors.ink, fontWeight: '800', marginTop: 12, marginBottom: 6 },
  body: { color: colors.muted, fontSize: 14, lineHeight: 21, marginBottom: 12 },
  preview: { width: '100%', height: 220, borderRadius: 14, backgroundColor: '#0F1A17', marginBottom: 10 },
  meta: { fontSize: 13, fontWeight: '700', color: colors.ink, marginBottom: 4 },
  hint: { fontSize: 12, color: colors.muted, lineHeight: 18, marginBottom: 8 },
  stats: { gap: 4, marginBottom: 12, marginTop: 8 },
  stat: { fontSize: 14, fontWeight: '700', color: colors.ink },
  error: { color: colors.red, fontWeight: '700', marginTop: 10 },
  disclaimer: { fontSize: 11, color: colors.muted, lineHeight: 16, marginTop: 12 },
});
