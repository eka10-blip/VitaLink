import type { MetricQuality, MetricReading } from './types.js';

/**
 * Map SmartSpectra sample confidence into the Person 4 contract quality enum.
 * Confidence often stays 0 until windows fill (pulse ~12s, breathing ~30s).
 * Still surface numeric values as "limited" so the UI can show progress.
 */
export function qualityFromConfidence(confidence: number | null | undefined): MetricQuality {
  if (confidence == null || Number.isNaN(confidence) || confidence <= 0) {
    return 'limited';
  }
  if (confidence < 0.5) return 'limited';
  return 'good';
}

export function readingFromSample(
  unit: string,
  value: number | null | undefined,
  confidence: number | null | undefined,
  measuredAt: string,
): MetricReading {
  const conf = confidence == null ? null : Number(confidence);
  if (value == null || Number.isNaN(Number(value))) {
    return {
      value: null,
      unit,
      source: 'presage',
      quality: 'unavailable',
      measuredAt: null,
      confidence: conf,
    };
  }
  return {
    value: Math.round(Number(value)),
    unit,
    source: 'presage',
    quality: qualityFromConfidence(conf),
    measuredAt,
    confidence: conf,
  };
}
