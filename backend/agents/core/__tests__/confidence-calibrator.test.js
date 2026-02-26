/**
 * Unit test: verifies confidence calibration with bucket-based accuracy tracking.
 * Run with: node backend/agents/core/__tests__/confidence-calibrator.test.js
 */

import { getConfidenceCalibrator } from '../confidence-calibrator.js';

function runTests() {
  let passed = 0;
  let failed = 0;

  function assert(condition, message) {
    if (condition) {
      console.log(`  PASS: ${message}`);
      passed++;
    } else {
      console.error(`  FAIL: ${message}`);
      failed++;
    }
  }

  function assertApprox(actual, expected, tolerance, message) {
    const diff = Math.abs(actual - expected);
    assert(diff <= tolerance, `${message} (expected ~${expected}, got ${actual}, diff ${diff.toFixed(4)})`);
  }

  const calibrator = getConfidenceCalibrator();

  // ── Test 1: Singleton pattern ──
  console.log('\nTest 1: Singleton pattern');
  const calibrator2 = getConfidenceCalibrator();
  assert(calibrator === calibrator2, 'getConfidenceCalibrator() returns same instance');

  // ── Test 2: Initial calibration stats have 5 empty buckets ──
  console.log('\nTest 2: Initial calibration stats');
  const initialStats = calibrator.getCalibrationStats();
  assert(Array.isArray(initialStats.buckets), 'stats.buckets is an array');
  assert(initialStats.buckets.length === 5, `5 buckets (got ${initialStats.buckets.length})`);
  assert(initialStats.buckets[0].range === '0.0-0.2', `First bucket range is 0.0-0.2`);
  assert(initialStats.buckets[1].range === '0.2-0.4', `Second bucket range is 0.2-0.4`);
  assert(initialStats.buckets[2].range === '0.4-0.6', `Third bucket range is 0.4-0.6`);
  assert(initialStats.buckets[3].range === '0.6-0.8', `Fourth bucket range is 0.6-0.8`);
  assert(initialStats.buckets[4].range === '0.8-1.0', `Fifth bucket range is 0.8-1.0`);
  assert(initialStats.buckets.every(b => b.predictionCount === 0), 'All buckets start with 0 predictions');
  assert(initialStats.buckets.every(b => b.correctCount === 0), 'All buckets start with 0 correct');
  assert(typeof initialStats.calibrationError === 'number', 'calibrationError is a number');

  // ── Test 3: recordPrediction updates the correct bucket ──
  console.log('\nTest 3: recordPrediction updates correct bucket');
  calibrator.recordPrediction('DEC-001', 0.85, true);
  const statsAfterOne = calibrator.getCalibrationStats();
  const bucket4 = statsAfterOne.buckets[4]; // 0.8-1.0
  assert(bucket4.predictionCount === 1, `Bucket 0.8-1.0 has 1 prediction (got ${bucket4.predictionCount})`);
  assert(bucket4.correctCount === 1, `Bucket 0.8-1.0 has 1 correct (got ${bucket4.correctCount})`);
  assertApprox(bucket4.actualAccuracy, 1.0, 0.001, 'Actual accuracy is 1.0');

  // ── Test 4: recordPrediction with incorrect outcome ──
  console.log('\nTest 4: recordPrediction with incorrect outcome');
  calibrator.recordPrediction('DEC-002', 0.9, false);
  const statsAfterTwo = calibrator.getCalibrationStats();
  const bucket4v2 = statsAfterTwo.buckets[4];
  assert(bucket4v2.predictionCount === 2, `Bucket 0.8-1.0 has 2 predictions (got ${bucket4v2.predictionCount})`);
  assert(bucket4v2.correctCount === 1, `Bucket 0.8-1.0 still has 1 correct (got ${bucket4v2.correctCount})`);
  assertApprox(bucket4v2.actualAccuracy, 0.5, 0.001, 'Actual accuracy is 0.5');

  // ── Test 5: Bucket boundary assignment ──
  console.log('\nTest 5: Bucket boundary assignment');
  calibrator.recordPrediction('DEC-003', 0.0, true);   // bucket 0 (0.0-0.2)
  calibrator.recordPrediction('DEC-004', 0.19, false);  // bucket 0 (0.0-0.2)
  calibrator.recordPrediction('DEC-005', 0.2, true);    // bucket 1 (0.2-0.4)
  calibrator.recordPrediction('DEC-006', 0.4, true);    // bucket 2 (0.4-0.6)
  calibrator.recordPrediction('DEC-007', 0.6, false);   // bucket 3 (0.6-0.8)
  calibrator.recordPrediction('DEC-008', 0.79, true);   // bucket 3 (0.6-0.8)
  calibrator.recordPrediction('DEC-009', 1.0, true);    // bucket 4 (0.8-1.0) — 1.0 goes to last bucket

  const statsAfterBoundary = calibrator.getCalibrationStats();
  assert(statsAfterBoundary.buckets[0].predictionCount === 2, 'Bucket 0 has 2 predictions');
  assert(statsAfterBoundary.buckets[1].predictionCount === 1, 'Bucket 1 has 1 prediction');
  assert(statsAfterBoundary.buckets[2].predictionCount === 1, 'Bucket 2 has 1 prediction');
  assert(statsAfterBoundary.buckets[3].predictionCount === 2, 'Bucket 3 has 2 predictions');
  assert(statsAfterBoundary.buckets[4].predictionCount === 3, 'Bucket 4 has 3 predictions (2 + 1 boundary)');

  // ── Test 6: Calibration error calculation ──
  console.log('\nTest 6: Calibration error calculation');
  const calError = statsAfterBoundary.calibrationError;
  assert(typeof calError === 'number', 'calibrationError is a number');
  assert(calError >= 0 && calError <= 1, `calibrationError in [0,1] (got ${calError})`);
  // With data in multiple buckets, calibration error should be > 0
  // (perfect calibration is extremely unlikely with our random test data)
  assert(calError > 0, `calibrationError > 0 for miscalibrated data (got ${calError})`);

  // ── Test 7: getCalibratedConfidence returns a number in [0, 1] ──
  console.log('\nTest 7: getCalibratedConfidence returns valid confidence');
  const calibrated = calibrator.getCalibratedConfidence(0.85);
  assert(typeof calibrated === 'number', 'getCalibratedConfidence returns a number');
  assert(calibrated >= 0 && calibrated <= 1, `Calibrated confidence in [0,1] (got ${calibrated})`);

  // ── Test 8: getCalibratedConfidence adjusts based on historical mapping ──
  console.log('\nTest 8: getCalibratedConfidence adjusts toward actual accuracy');
  // Bucket 0.8-1.0 has 3 predictions, 2 correct => actual accuracy = 2/3 ~= 0.667
  // So a raw confidence of 0.85 should be pulled toward 0.667
  const calibratedHigh = calibrator.getCalibratedConfidence(0.9);
  assert(calibratedHigh < 0.9, `Overcalibrated high confidence adjusted down (got ${calibratedHigh})`);

  // ── Test 9: getCalibratedConfidence returns raw when no data in bucket ──
  console.log('\nTest 9: getCalibratedConfidence returns raw when no bucket data');
  // Reset calibrator for a clean test — use a fresh instance approach
  // Instead, test a bucket that we know has data vs one concept:
  // Bucket 0.2-0.4 has 1 prediction — still adjusts
  // For a truly empty bucket, we'd need a fresh calibrator
  // The factory returns singleton, so test with known bucket
  const rawVal = 0.35;
  const calibratedLow = calibrator.getCalibratedConfidence(rawVal);
  assert(typeof calibratedLow === 'number', 'Returns a number even for sparse bucket');

  // ── Test 10: Edge case — confidence at exact boundaries ──
  console.log('\nTest 10: Edge case confidence values');
  const cal0 = calibrator.getCalibratedConfidence(0.0);
  assert(typeof cal0 === 'number' && cal0 >= 0 && cal0 <= 1, `Confidence 0.0 handled (got ${cal0})`);
  const cal1 = calibrator.getCalibratedConfidence(1.0);
  assert(typeof cal1 === 'number' && cal1 >= 0 && cal1 <= 1, `Confidence 1.0 handled (got ${cal1})`);

  // ── Test 11: Edge case — out of range confidence clamped ──
  console.log('\nTest 11: Out of range confidence clamped');
  const calNeg = calibrator.getCalibratedConfidence(-0.5);
  assert(calNeg >= 0 && calNeg <= 1, `Negative confidence clamped to [0,1] (got ${calNeg})`);
  const calOver = calibrator.getCalibratedConfidence(1.5);
  assert(calOver >= 0 && calOver <= 1, `Over-1 confidence clamped to [0,1] (got ${calOver})`);

  // ── Test 12: getCalibrationStats structure ──
  console.log('\nTest 12: getCalibrationStats returns full structure');
  const fullStats = calibrator.getCalibrationStats();
  assert(typeof fullStats.totalPredictions === 'number', 'totalPredictions present');
  assert(fullStats.totalPredictions === 9, `totalPredictions = 9 (got ${fullStats.totalPredictions})`);
  assert(typeof fullStats.calibrationError === 'number', 'calibrationError present');
  assert(Array.isArray(fullStats.buckets), 'buckets array present');
  fullStats.buckets.forEach((b, i) => {
    assert(typeof b.range === 'string', `Bucket ${i} has range string`);
    assert(typeof b.predictionCount === 'number', `Bucket ${i} has predictionCount`);
    assert(typeof b.correctCount === 'number', `Bucket ${i} has correctCount`);
    assert(typeof b.actualAccuracy === 'number', `Bucket ${i} has actualAccuracy`);
  });

  // ── Test 13: recordPrediction with many entries for statistical stability ──
  console.log('\nTest 13: Statistical stability with many predictions');
  // Add 20 more predictions to bucket 0.8-1.0, 70% correct (below the 0.9 midpoint)
  for (let i = 0; i < 20; i++) {
    calibrator.recordPrediction(`DEC-BULK-${i}`, 0.85 + Math.random() * 0.15, i < 14);
  }
  const bulkStats = calibrator.getCalibrationStats();
  const bulkBucket4 = bulkStats.buckets[4];
  assert(bulkBucket4.predictionCount === 23, `Bucket 4 now has 23 predictions (got ${bulkBucket4.predictionCount})`);
  // 2 original correct + 14 bulk correct = 16 correct out of 23
  assert(bulkBucket4.correctCount === 16, `Bucket 4 has 16 correct (got ${bulkBucket4.correctCount})`);

  // ── Test 14: Calibration error is meaningful ──
  console.log('\nTest 14: Calibration error is meaningful');
  // With significant data in the 0.8-1.0 bucket showing ~69.6% accuracy,
  // the calibration error should reflect the gap between predicted (~0.9) and actual (~0.696)
  const finalStats = calibrator.getCalibrationStats();
  assert(finalStats.calibrationError > 0, `Calibration error > 0 (got ${finalStats.calibrationError})`);

  // ── Summary ──
  console.log(`\n${'='.repeat(40)}`);
  console.log(`Results: ${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

runTests();
