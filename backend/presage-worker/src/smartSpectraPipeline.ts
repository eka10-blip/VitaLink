import { appConfig } from './config.js';
import { readingFromSample } from './quality.js';
import type { MetricReading } from './types.js';

export type PipelineMetricsHandler = (update: {
  pulse: MetricReading;
  breathing: MetricReading;
  validationHint: string | null;
  fatal?: boolean;
}) => void;

type SmartSpectraModule = typeof import('@smartspectra/node-sdk');

/**
 * Wraps only documented @smartspectra/node-sdk APIs.
 * Never lets FFI throws escape — that previously killed the whole Node process
 * on Railway and wiped in-memory sessions ("Session not found").
 * @see https://smartspectra.presagetech.com/docs/nodejs
 */
export class SmartSpectraPipeline {
  private sdk: InstanceType<SmartSpectraModule['SmartSpectraSDK']> | null = null;
  private pixelFormatRgb: SmartSpectraModule['PixelFormat'][keyof SmartSpectraModule['PixelFormat']] | null =
    null;
  private lastTimestampUs = 0;
  private startedAtMs = 0;
  private fatal = false;
  private fatalMessage: string | null = null;

  constructor(private readonly onUpdate: PipelineMetricsHandler) {}

  isFatal(): boolean {
    return this.fatal;
  }

  getFatalMessage(): string | null {
    return this.fatalMessage;
  }

  async start(): Promise<void> {
    if (appConfig.presageMode !== 'live') {
      throw new Error('SmartSpectraPipeline requires PRESAGE_MODE=live');
    }

    let mod: SmartSpectraModule;
    try {
      mod = await import('@smartspectra/node-sdk');
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      throw new Error(
        `Failed to load @smartspectra/node-sdk. Run npm install in backend/presage-worker. (${message})`,
      );
    }

    const {
      SmartSpectraSDK,
      PixelFormat,
      FrameTransform,
      breathingMetrics,
      cardioMetrics,
      decodeMetrics,
    } = mod;

    this.pixelFormatRgb = PixelFormat.kRGB;

    // Pulse + breathing only — skip heavier models that may need GPU/Vulkan on cloud hosts.
    const requestedMetrics = [...breathingMetrics, ...cardioMetrics].filter((name) => {
      const n = String(name).toLowerCase();
      return !n.includes('blood') && !n.includes('bp') && !n.includes('phasic');
    });

    const sdk = new SmartSpectraSDK({
      apiKey: appConfig.smartSpectraApiKey,
      requestedMetrics: requestedMetrics.length > 0 ? requestedMetrics : [...breathingMetrics, ...cardioMetrics],
    });

    sdk.on('validationStatus', (_code: number, _ts: number, hint: string) => {
      if (this.fatal) return;
      this.onUpdate({
        pulse: readingFromSample('bpm', null, null, new Date().toISOString()),
        breathing: readingFromSample('breaths/min', null, null, new Date().toISOString()),
        validationHint: hint || null,
      });
    });

    sdk.on('metrics', (buf: Buffer, _ts: number) => {
      if (this.fatal) return;
      try {
        const metrics = decodeMetrics(buf) as {
          breathing?: { rate?: Array<{ value: number; confidence?: number }> };
          cardio?: { pulseRate?: Array<{ value: number; confidence?: number }> };
        };
        if (!metrics || Buffer.isBuffer(metrics)) return;
        const now = new Date().toISOString();
        const pulseSample = metrics.cardio?.pulseRate?.at(-1);
        const breathSample = metrics.breathing?.rate?.at(-1);
        this.onUpdate({
          pulse: readingFromSample('bpm', pulseSample?.value, pulseSample?.confidence, now),
          breathing: readingFromSample(
            'breaths/min',
            breathSample?.value,
            breathSample?.confidence,
            now,
          ),
          validationHint: null,
        });
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        console.error('[smartspectra] metrics decode failed:', message);
      }
    });

    sdk.on('error', (code: number, message: string, retryable: boolean) => {
      console.error(`[smartspectra] error code=${code} retryable=${retryable}: ${message}`);
      if (!retryable) {
        this.markFatal(message || `SmartSpectra error ${code}`);
      } else {
        this.onUpdate({
          pulse: readingFromSample('bpm', null, null, new Date().toISOString()),
          breathing: readingFromSample('breaths/min', null, null, new Date().toISOString()),
          validationHint: `Presage recovering: ${message}`,
        });
      }
    });

    sdk.useCustomInput(FrameTransform.kNone);
    sdk.start();
    this.sdk = sdk;
    this.startedAtMs = Date.now();
    this.lastTimestampUs = 0;
    this.fatal = false;
    this.fatalMessage = null;
  }

  sendRgbFrame(buffer: Uint8Array, width: number, height: number, timestampUs: number): boolean {
    if (this.fatal || !this.sdk || this.pixelFormatRgb == null) return false;
    if (timestampUs <= this.lastTimestampUs) {
      timestampUs = this.lastTimestampUs + 1;
    }
    const gapUs = this.lastTimestampUs === 0 ? 0 : timestampUs - this.lastTimestampUs;
    if (this.lastTimestampUs > 0 && gapUs > 2_000_000) {
      console.warn('[smartspectra] timestamp gap >2s; caller should stop/start session');
      return false;
    }
    try {
      const ok = this.sdk.sendFrame(
        Buffer.from(buffer),
        width,
        height,
        width * 3,
        this.pixelFormatRgb,
        timestampUs,
      );
      if (ok) this.lastTimestampUs = timestampUs;
      return ok;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      this.markFatal(message);
      return false;
    }
  }

  elapsedSeconds(): number {
    if (!this.startedAtMs) return 0;
    return (Date.now() - this.startedAtMs) / 1000;
  }

  async stop(): Promise<void> {
    if (!this.sdk) return;
    const sdk = this.sdk;
    this.sdk = null;
    try {
      await sdk.stopAsync();
    } catch (err) {
      console.warn('[smartspectra] stopAsync failed:', err instanceof Error ? err.message : err);
    }
    try {
      await sdk.destroy();
    } catch (err) {
      console.warn('[smartspectra] destroy failed:', err instanceof Error ? err.message : err);
    }
  }

  private markFatal(message: string): void {
    if (this.fatal) return;
    this.fatal = true;
    this.fatalMessage = message;
    console.error(`[smartspectra] fatal — stopping frames: ${message}`);
    this.onUpdate({
      pulse: readingFromSample('bpm', null, null, new Date().toISOString()),
      breathing: readingFromSample('breaths/min', null, null, new Date().toISOString()),
      validationHint: `Presage stopped: ${message}. Tap Start again.`,
      fatal: true,
    });
  }
}
