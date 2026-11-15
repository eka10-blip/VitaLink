import { config as loadEnv } from 'dotenv';
import { z } from 'zod';

loadEnv();

/** Treat empty strings as missing so `.env.example` copies don't fail Zod. */
const optionalNonEmpty = z.preprocess(
  (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
  z.string().min(1).optional(),
);

const optionalUrl = z.preprocess(
  (value) => (typeof value === 'string' && value.trim() === '' ? undefined : value),
  z.string().url().optional(),
);

const schema = z.object({
  PORT: z.coerce.number().int().positive().default(8787),
  LIVEKIT_URL: optionalNonEmpty,
  LIVEKIT_API_KEY: optionalNonEmpty,
  LIVEKIT_API_SECRET: optionalNonEmpty,
  SMARTSPECTRA_API_KEY: optionalNonEmpty,
  PRESAGE_MODE: z.enum(['mock', 'live']).default('mock'),
  PERSON3_MEASUREMENT_URL: optionalUrl,
  PERSON3_SERVICE_TOKEN: optionalNonEmpty,
  MIN_MEASUREMENT_SECONDS: z.coerce.number().positive().default(35),
});

const parsed = schema.safeParse(process.env);
if (!parsed.success) {
  console.error(parsed.error.flatten().fieldErrors);
  throw new Error('Invalid presage-worker environment configuration');
}

const env = parsed.data;

export const appConfig = {
  port: env.PORT,
  livekitUrl: env.LIVEKIT_URL ?? '',
  livekitApiKey: env.LIVEKIT_API_KEY ?? '',
  livekitApiSecret: env.LIVEKIT_API_SECRET ?? '',
  smartSpectraApiKey: env.SMARTSPECTRA_API_KEY ?? '',
  presageMode: env.PRESAGE_MODE,
  person3MeasurementUrl: env.PERSON3_MEASUREMENT_URL,
  person3ServiceToken: env.PERSON3_SERVICE_TOKEN,
  minMeasurementSeconds: env.MIN_MEASUREMENT_SECONDS,
};

export function isLiveKitConfigured(): boolean {
  return Boolean(appConfig.livekitUrl && appConfig.livekitApiKey && appConfig.livekitApiSecret);
}

export function assertLiveKitConfigured(): void {
  if (!isLiveKitConfigured()) {
    throw new Error(
      'LiveKit is not configured. Set LIVEKIT_URL, LIVEKIT_API_KEY, and LIVEKIT_API_SECRET.',
    );
  }
}

export function assertPresageLiveConfigured(): void {
  if (appConfig.presageMode === 'live' && !appConfig.smartSpectraApiKey) {
    throw new Error('PRESAGE_MODE=live requires SMARTSPECTRA_API_KEY');
  }
}
