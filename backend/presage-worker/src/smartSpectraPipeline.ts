import { appConfig } from './config.js';
import { downsampleRgb24 } from './frameUtil.js';
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
 * Official SmartSpectra custom-input path with cloud-safe settings:
 * - start only when the caller is ready to push frames (no idle gap)
 * - monotonic hrtime timestamps (docs: avoid wall-clock / gap errors)
 * - pulse + breathing rate only (no Vulkan arterial models)
 * - downsample to ≤640px width to keep Railway memory stable
 * @see https://smartspectra.presagetech.com/docs/nodejs
 */
export class SmartSpectraPipeline {
  private sdk: InstanceType<SmartSpectraModule['SmartSpectraSDK']> | null = null;
  private mod: SmartSpectraModule | null = null;
  private pixelFormatRgb: SmartSpectraModule['PixelFormat'][keyof SmartSpectraModule['PixelFormat']] | null =
    null;
  private hrStartNs = 0n;
  private lastTimestampUs = 0;
  private startedAtMs = 0;
  private fatal = false;
  private fatalMessage: string | null = null;
  private metricsEvents = 0;
  private restartCount = 0;
  private restarting = false;
  private needsRestart = false;

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
    if (!this.mod) {
      try {
        this.mod = await import('@smartspectra/node-sdk');
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        throw new Error(`Failed to load @smartspectra/node-sdk (${message})`);
      }
    }
    await this.bootSdk();
  }

  sendRgbFrame(buffer: Uint8Array, width: number, height: number): boolean {
    if (this.fatal || this.restarting || !this.sdk || this.pixelFormatRgb == null) return false;

    const scaled = downsampleRgb24(buffer, width, height, 640);
    let timestampUs = Number((process.hrtime.bigint() - this.hrStartNs) / 1000n);
    if (timestampUs <= this.lastTimestampUs) {
      timestampUs = this.lastTimestampUs + 1;
    }

    try {
      const ok = this.sdk.sendFrame(
        scaled.data,
        scaled.width,
        scaled.height,
        scaled.width * 3,
        this.pixelFormatRgb,
        timestampUs,
      );
      if (ok) this.lastTimestampUs = timestampUs;
      return ok;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (/valid state|stopped|frame rate/i.test(message) && this.restartCount < 2) {
        this.needsRestart = true;
        return false;
      }
      this.markFatal(message);
      return false;
    }
  }

  async maybeRestart(): Promise<boolean> {
    if (!this.needsRestart || this.fatal) return false;
    this.needsRestart = false;
    if (this.restartCount >= 2) {
      this.markFatal('Presage stopped repeatedly — try again with steadier lighting/face position.');
      return false;
    }
    this.restartCount += 1;
    this.restarting = true;
    this.onUpdate({
      pulse: readingFromSample('bpm', null, null, new Date().toISOString()),
      breathing: readingFromSample('breaths/min', null, null, new Date().toISOString()),
      validationHint: 'Presage recovering — keep your face centered…',
    });
    try {
      await this.stopSdkOnly();
      await this.bootSdk();
      this.restarting = false;
      return true;
    } catch (err) {
      this.restarting = false;
      this.markFatal(err instanceof Error ? err.message : String(err));
      return false;
    }
  }

  elapsedSeconds(): number {
    if (!this.startedAtMs) return 0;
    return (Date.now() - this.startedAtMs) / 1000;
  }

  async stop(): Promise<void> {
    await this.stopSdkOnly();
  }

  private async bootSdk(): Promise<void> {
    if (!this.mod) throw new Error('SmartSpectra module not loaded');
    const { SmartSpectraSDK, PixelFormat, FrameTransform, MetricType, decodeMetrics } = this.mod;
    this.pixelFormatRgb = PixelFormat.kRGB;

    const requestedMetrics = [MetricType.BREATHING_RATE, MetricType.PULSE_RATE];
    const sdk = new SmartSpectraSDK({
      apiKey: appConfig.smartSpectraApiKey,
      requestedMetrics,
    });

    sdk.on('validationStatus', (_code: number, _ts: number, hint: string) => {
      if (this.fatal || this.restarting) return;
      this.onUpdate({
        pulse: readingFromSample('bpm', null, null, new Date().toISOString()),
        breathing: readingFromSample('breaths/min', null, null, new Date().toISOString()),
        validationHint: hint || null,
      });
    });

    sdk.on('metrics', (buf: Buffer) => {
      if (this.fatal || this.restarting) return;
      try {
        const decoded = decodeMetrics(buf) as { toJSON?: () => Record<string, unknown> };
        if (!decoded || Buffer.isBuffer(decoded)) return;
        const metrics = (
          typeof decoded.toJSON === 'function' ? decoded.toJSON() : decoded
        ) as {
          breathing?: { rate?: Array<{ value?: number; confidence?: number }> };
          cardio?: { pulseRate?: Array<{ value?: number; confidence?: number }> };
        };

        this.metricsEvents += 1;
        const now = new Date().toISOString();
        const pulseList = metrics.cardio?.pulseRate ?? [];
        const breathList = metrics.breathing?.rate ?? [];
        const pulseSample = pulseList.at(-1);
        const breathSample = breathList.at(-1);

        if (this.metricsEvents === 1 || this.metricsEvents % 25 === 0 || pulseSample?.value != null) {
          console.log(
            `[smartspectra] metrics #${this.metricsEvents} pulse=${pulseSample?.value ?? 'n/a'} breath=${breathSample?.value ?? 'n/a'}`,
          );
        }

        this.onUpdate({
          pulse: readingFromSample('bpm', pulseSample?.value, pulseSample?.confidence, now),
          breathing: readingFromSample(
            'breaths/min',
            breathSample?.value,
            breathSample?.confidence,
            now,
          ),
          validationHint:
            breathSample?.value == null
              ? 'Pulse updating — hold still for breathing (~30–45s total)…'
              : 'Vitals locked — finishing measurement…',
        });
      } catch (err) {
        console.error('[smartspectra] metrics decode failed:', err instanceof Error ? err.message : err);
      }
    });

    sdk.on('error', (code: number, message: string, retryable: boolean) => {
      console.error(`[smartspectra] error code=${code} retryable=${retryable}: ${message}`);
      if (code === 14 || /frame rate|stopped|valid state/i.test(message)) {
        this.needsRestart = true;
        return;
      }
      if (!retryable) this.markFatal(message || `SmartSpectra error ${code}`);
    });

    sdk.useCustomInput(FrameTransform.kNone);
    sdk.start();
    this.sdk = sdk;
    this.hrStartNs = process.hrtime.bigint();
    this.lastTimestampUs = 0;
    this.startedAtMs = Date.now();
    this.fatal = false;
    this.fatalMessage = null;
    this.metricsEvents = 0;
    this.needsRestart = false;
    console.log('[smartspectra] started (PULSE_RATE + BREATHING_RATE, hrtime clock, ≤640px)');
  }

  private async stopSdkOnly(): Promise<void> {
    if (!this.sdk) return;
    const sdk = this.sdk;
    this.sdk = null;
    try {
      await sdk.stopAsync();
    } catch {
      /* ignore */
    }
    try {
      await sdk.destroy();
    } catch {
      /* ignore */
    }
  }

  private markFatal(message: string): void {
    if (this.fatal) return;
    this.fatal = true;
    this.fatalMessage = message;
    console.error(`[smartspectra] fatal: ${message}`);
    this.onUpdate({
      pulse: readingFromSample('bpm', null, null, new Date().toISOString()),
      breathing: readingFromSample('breaths/min', null, null, new Date().toISOString()),
      validationHint: `Presage stopped: ${message}. Tap Start again.`,
      fatal: true,
    });
  }
}
