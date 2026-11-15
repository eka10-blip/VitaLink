import type { MetricQuality, MetricReading } from './types.js';

/**
 * SmartSpectra confidence is a percentage [0, 100] (see SDK model cards).
 * Also accept normalized [0, 1] if a future SDK change returns that.
 */
export function qualityFromConfidence(confidence: number | null | undefined): MetricQuality {
  if (confidence == null || Number.isNaN(confidence)) return 'limited';
  const c = confidence > 1 ? confidence / 100 : confidence;
  if (c <= 0) return 'limited';
  if (c < 0.5) return 'limited';
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
