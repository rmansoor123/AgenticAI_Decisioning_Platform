/**
 * Confidence Calibrator — Bucket-based accuracy tracking and confidence adjustment.
 *
 * Buckets raw prediction confidences into 5 ranges (0-0.2, 0.2-0.4, 0.4-0.6,
 * 0.6-0.8, 0.8-1.0) and tracks actual accuracy per bucket. Uses historical
 * accuracy data to adjust raw confidence scores toward observed reality.
 *
 * Calibration error = average |predicted_midpoint - actual_accuracy| per bucket
 * (only for buckets with data).
 *
 * Persisted to SQLite `agent_calibration` table via db_ops with in-memory fallback.
 */

import { db_ops } from '../../shared/common/database.js';

const TABLE = 'agent_calibration';
const PK_FIELD = 'calibration_id';
const SINGLETON_ID = 'calibration-buckets-v1';

/** Bucket boundary definitions */
const BUCKET_RANGES = [
  { min: 0.0, max: 0.2, label: '0.0-0.2', midpoint: 0.1 },
  { min: 0.2, max: 0.4, label: '0.2-0.4', midpoint: 0.3 },
  { min: 0.4, max: 0.6, label: '0.4-0.6', midpoint: 0.5 },
  { min: 0.6, max: 0.8, label: '0.6-0.8', midpoint: 0.7 },
  { min: 0.8, max: 1.0, label: '0.8-1.0', midpoint: 0.9 }
];

class ConfidenceCalibrator {
  constructor() {
    /** Per-bucket tracking: { predictionCount, correctCount } */
    this.buckets = BUCKET_RANGES.map(() => ({
      predictionCount: 0,
      correctCount: 0
    }));

    this._loadFromDb();
  }

  // ─── Persistence ───────────────────────────────────────────────

  /**
   * Load bucket data from SQLite on startup. Graceful fallback to empty buckets.
   */
  _loadFromDb() {
    try {
      const row = db_ops.getById(TABLE, PK_FIELD, SINGLETON_ID);
      if (row?.data) {
        const data = typeof row.data === 'string' ? JSON.parse(row.data) : row.data;
        if (Array.isArray(data.buckets) && data.buckets.length === 5) {
          for (let i = 0; i < 5; i++) {
            this.buckets[i].predictionCount = data.buckets[i].predictionCount || 0;
            this.buckets[i].correctCount = data.buckets[i].correctCount || 0;
          }
        }
      }
    } catch (err) {
      // Graceful fallback — start with empty buckets
    }
  }

  /**
   * Persist current bucket data to SQLite.
   */
  _saveToDb() {
    try {
      db_ops.insert(TABLE, PK_FIELD, SINGLETON_ID, {
        buckets: this.buckets.map((b, i) => ({
          range: BUCKET_RANGES[i].label,
          predictionCount: b.predictionCount,
          correctCount: b.correctCount
        })),
        updatedAt: new Date().toISOString()
      });
    } catch (err) {
      // Persist failure is non-fatal; in-memory state is still valid
    }
  }

  // ─── Bucket Assignment ─────────────────────────────────────────

  /**
   * Determine which bucket index a confidence value belongs to.
   * Clamps to [0, 1] and maps 1.0 to the last bucket.
   */
  _getBucketIndex(confidence) {
    const clamped = Math.max(0, Math.min(1, confidence));
    // Integer division: 0.0-0.199 -> 0, 0.2-0.399 -> 1, ..., 0.8-1.0 -> 4
    const index = Math.floor(clamped * 5);
    // 1.0 would give index 5 — clamp to 4
    return Math.min(index, 4);
  }

  // ─── Public API ────────────────────────────────────────────────

  /**
   * Record the outcome of a prediction for calibration tracking.
   *
   * @param {string} decisionId - Unique decision identifier
   * @param {number} confidence - Raw confidence score [0, 1]
   * @param {boolean} wasCorrect - Whether the prediction was correct
   */
  recordPrediction(decisionId, confidence, wasCorrect) {
    const idx = this._getBucketIndex(confidence);
    this.buckets[idx].predictionCount++;
    if (wasCorrect) {
      this.buckets[idx].correctCount++;
    }
    this._saveToDb();
  }

  /**
   * Adjust a raw confidence score using historical calibration data.
   *
   * Blends the raw confidence with the observed actual accuracy for
   * the corresponding bucket. When a bucket has no data, returns the
   * raw confidence unchanged.
   *
   * @param {number} raw - Raw confidence score
   * @returns {number} Calibrated confidence in [0, 1]
   */
  getCalibratedConfidence(raw) {
    const clamped = Math.max(0, Math.min(1, raw));
    const idx = this._getBucketIndex(clamped);
    const bucket = this.buckets[idx];

    if (bucket.predictionCount === 0) {
      return clamped;
    }

    const actualAccuracy = bucket.correctCount / bucket.predictionCount;

    // Blend raw confidence with observed accuracy.
    // Weight shifts toward actual accuracy as sample size grows.
    // weight = min(predictionCount / 20, 1) — full weight at 20+ samples
    const weight = Math.min(bucket.predictionCount / 20, 1);
    const calibrated = clamped * (1 - weight) + actualAccuracy * weight;

    return Math.max(0, Math.min(1, calibrated));
  }

  /**
   * Get calibration statistics for all buckets.
   *
   * @returns {{ buckets: Array, calibrationError: number, totalPredictions: number }}
   */
  getCalibrationStats() {
    let totalPredictions = 0;
    let errorSum = 0;
    let bucketsWithData = 0;

    const buckets = BUCKET_RANGES.map((range, i) => {
      const b = this.buckets[i];
      totalPredictions += b.predictionCount;

      const actualAccuracy = b.predictionCount > 0
        ? b.correctCount / b.predictionCount
        : 0;

      // Calibration error contribution: |midpoint - actual_accuracy|
      if (b.predictionCount > 0) {
        errorSum += Math.abs(range.midpoint - actualAccuracy);
        bucketsWithData++;
      }

      return {
        range: range.label,
        predictionCount: b.predictionCount,
        correctCount: b.correctCount,
        actualAccuracy: Math.round(actualAccuracy * 10000) / 10000
      };
    });

    const calibrationError = bucketsWithData > 0
      ? Math.round((errorSum / bucketsWithData) * 10000) / 10000
      : 0;

    return {
      buckets,
      calibrationError,
      totalPredictions
    };
  }
}

// ─── Singleton Factory ─────────────────────────────────────────

let instance = null;

/**
 * Get the singleton ConfidenceCalibrator instance.
 * @returns {ConfidenceCalibrator}
 */
export function getConfidenceCalibrator() {
  if (!instance) instance = new ConfidenceCalibrator();
  return instance;
}
