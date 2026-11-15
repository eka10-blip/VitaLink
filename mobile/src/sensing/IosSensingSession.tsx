import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Linking, Platform, StyleSheet, Text, View } from 'react-native';
import {
  AudioSession,
  LiveKitRoom,
  VideoTrack,
  useTracks,
  isTrackReference,
  type TrackReferenceOrPlaceholder,
} from '@livekit/react-native';
import { mediaDevices, permissions } from '@livekit/react-native-webrtc';
import { Track } from 'livekit-client';
import { Action, Panel, Pill } from '../ui';
import { colors } from '../theme';
import {
  cancelSensingSession,
  discoverWorker,
  getSensingSession,
  getWorkerBaseUrl,
  startSensingSession,
} from './sensingApi';
import type { SensingSessionSnapshot, StartSensingResponse } from './types';

type Props = {
  patientId: string;
  onComplete?: (snapshot: SensingSessionSnapshot) => void;
};

async function ensureCameraAccess(): Promise<void> {
  const status = await permissions.request({ name: 'camera' });
  if (status === permissions.RESULT.GRANTED || status === true || status === 'granted') {
    return;
  }
  try {
    const stream = await mediaDevices.getUserMedia({ audio: false, video: true });
    stream.getTracks().forEach((track) => track.stop());
  } catch {
    throw new Error(
      'Camera permission is required. Enable Camera for VitaLink in Settings → VitaLink, then try again.',
    );
  }
}

function LocalPreview() {
  const tracks = useTracks([Track.Source.Camera]);
  const local = tracks.find(
    (t: TrackReferenceOrPlaceholder) => isTrackReference(t) && t.participant.isLocal,
  );
  if (!local || !isTrackReference(local)) {
    return (
      <View style={styles.previewPlaceholder}>
        <Text style={styles.previewPlaceholderText}>Starting front camera…</Text>
        <Text style={styles.hint}>Center your face in the frame with good lighting.</Text>
      </View>
    );
  }
  return (
    <View>
      <VideoTrack trackRef={local} style={styles.preview} objectFit="cover" />
      <Text style={styles.faceGuide}>Keep your face centered — Presage is scanning</Text>
    </View>
  );
}

/**
 * iOS Person 2 sensing: auto-finds worker, requests camera, publishes to LiveKit for Presage.
 */
export function IosSensingSession({ patientId, onComplete }: Props) {
  const [sessionCreds, setSessionCreds] = useState<StartSensingResponse | null>(null);
  const [snapshot, setSnapshot] = useState<SensingSessionSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [phase, setPhase] = useState<string | null>(null);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const stopPolling = () => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  };

  const start = useCallback(async () => {
    if (Platform.OS !== 'ios') {
      setError('Camera sensing is iOS-only in this delivery.');
      return;
    }

    setBusy(true);
    setError(null);
    setSnapshot(null);

    try {
      setPhase('Finding Presage worker…');
      const base = await discoverWorker();
      setPhase(`Worker found. Requesting camera…`);
      console.log('[sensing] worker', base);

      await ensureCameraAccess();
      setPhase('Camera allowed. Starting measurement session…');

      const started = await startSensingSession(patientId);
      if (!started.livekitUrl || !started.participantToken) {
        throw new Error('Worker did not return LiveKit credentials. Check LIVEKIT_* in the worker .env.');
      }

      setSessionCreds(started);
      setPhase('Opening camera and connecting to LiveKit…');

      stopPolling();
      let transientErrors = 0;
      setPhase('Hold still ~45 seconds — pulse first, then breathing…');
      pollRef.current = setInterval(async () => {
        try {
          const next = await getSensingSession(started.sessionId);
          transientErrors = 0;
          setSnapshot(next);
          if (next.error) setError(next.error);
          else setError(null);
          if (next.validationHint) setPhase(next.validationHint);
          if (next.status === 'completed' || next.status === 'failed' || next.status === 'cancelled') {
            stopPolling();
            onComplete?.(next);
          }
        } catch (e) {
          const message = e instanceof Error ? e.message : 'Failed to poll sensing session';
          // Brief Railway blips (502) during heavy Presage work — keep scanning.
          if (/502|503|504|network|failed to fetch|timeout|abort/i.test(message)) {
            transientErrors += 1;
            setPhase('Worker busy measuring — keep your face in frame…');
            if (transientErrors < 8) return;
          }
          if (/session not found/i.test(message)) {
            stopPolling();
            setError('Scan session ended on the cloud worker. Tap Start camera sensing again.');
            setPhase(null);
            return;
          }
          setError(message);
        }
      }, 1500);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to start sensing');
      setPhase(null);
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
      setPhase(null);
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
      .then(() => setPhase((p) => p ?? 'Publishing front camera for Presage…'))
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
        <Text style={styles.body}>Presage + LiveKit sensing targets iOS builds only.</Text>
      </Panel>
    );
  }

  const pulse = snapshot?.pulse;
  const breathing = snapshot?.breathing;
  const measuring = Boolean(sessionCreds);

  return (
    <Panel>
      <Pill text="PERSON 2 · PRESAGE" tone="blue" />
      <Text style={styles.title}>Face scan for pulse & breathing</Text>
      <Text style={styles.body}>
        Tap start, allow Camera, then hold still with your face centered and well lit for about 30–40 seconds.
      </Text>

      {!measuring ? (
        <Action label={busy ? 'Starting…' : 'Start camera sensing'} disabled={busy} onPress={start} />
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
                publishDefaults: {
                  videoEncoding: { maxBitrate: 1_700_000, maxFramerate: 30 },
                },
                videoCaptureDefaults: {
                  facingMode: 'user',
                  resolution: { width: 1280, height: 720, frameRate: 30 },
                },
              }}
              onConnected={() => setPhase('Camera live — keep your face in view')}
              onDisconnected={() => setPhase('Disconnected from LiveKit room.')}
              onError={(e: Error) => setError(e.message)}
            >
              <LocalPreview />
            </LiveKitRoom>
          ) : null}

          <Text style={styles.meta}>Status: {snapshot?.status ?? sessionCreds.status}</Text>
          <Text style={styles.meta}>Worker: {snapshot?.workerConnected ? 'connected' : 'joining…'}</Text>
          <Text style={styles.meta}>
            Face video: {snapshot?.videoTrackSubscribed ? 'receiving' : 'waiting…'}
          </Text>
          <Text style={styles.meta}>Frames: {snapshot?.framesAccepted ?? 0}</Text>
          {getWorkerBaseUrl() ? <Text style={styles.tiny}>Worker: {getWorkerBaseUrl()}</Text> : null}
          {phase ? <Text style={styles.hint}>{phase}</Text> : null}

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

      {phase && !measuring ? <Text style={styles.hint}>{phase}</Text> : null}
      {error ? (
        <View style={styles.errorBlock}>
          <Text style={styles.error}>{error}</Text>
          {/Camera permission/i.test(error) ? (
            <Action label="Open Settings" secondary onPress={() => void Linking.openSettings()} />
          ) : null}
        </View>
      ) : null}
      <Text style={styles.disclaimer}>
        Uses the cloud Presage backend. Estimates only — not for diagnosis.
      </Text>
    </Panel>
  );
}

const styles = StyleSheet.create({
  title: { fontSize: 17, color: colors.ink, fontWeight: '800', marginTop: 12, marginBottom: 6 },
  body: { color: colors.muted, fontSize: 14, lineHeight: 21, marginBottom: 12 },
  preview: { width: '100%', height: 320, borderRadius: 14, backgroundColor: '#0F1A17', marginBottom: 6 },
  previewPlaceholder: {
    width: '100%',
    height: 320,
    borderRadius: 14,
    backgroundColor: '#0F1A17',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    marginBottom: 10,
  },
  previewPlaceholderText: { color: '#FFF', fontWeight: '800', marginBottom: 8 },
  faceGuide: {
    textAlign: 'center',
    color: colors.green,
    fontWeight: '700',
    fontSize: 13,
    marginBottom: 10,
  },
  meta: { fontSize: 13, fontWeight: '700', color: colors.ink, marginBottom: 4 },
  tiny: { fontSize: 10, color: colors.muted, marginBottom: 6 },
  hint: { fontSize: 12, color: colors.muted, lineHeight: 18, marginBottom: 8, textAlign: 'center' },
  stats: { gap: 4, marginBottom: 12, marginTop: 8 },
  stat: { fontSize: 14, fontWeight: '700', color: colors.ink },
  errorBlock: { marginTop: 10, gap: 8 },
  error: { color: colors.red, fontWeight: '700' },
  disclaimer: { fontSize: 11, color: colors.muted, lineHeight: 16, marginTop: 12 },
});
