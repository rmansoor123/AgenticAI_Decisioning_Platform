/**
 * Unit test: verifies the attack sequence pattern library and timeline matching algorithm.
 * Run with: node backend/agents/core/__tests__/sequence-patterns.test.js
 */

import { getSequencePatterns, matchSellerTimeline } from '../sequence-patterns.js';

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

  // ── Helper: create a timeline event ──
  function evt(domain, eventType, daysOffset, riskScore = 50) {
    const base = new Date('2025-01-01T00:00:00Z').getTime();
    return {
      domain,
      eventType,
      createdAt: new Date(base + daysOffset * 86400000).toISOString(),
      riskScore
    };
  }

  // ──────────────────────────────────────────────────
  // Test 1: Pattern library has 4 patterns with correct IDs
  // ──────────────────────────────────────────────────
  console.log('\nTest 1: Pattern library has 4 patterns with correct IDs');
  const patterns = getSequencePatterns();
  assert(Array.isArray(patterns), 'getSequencePatterns() returns an array');
  assert(patterns.length === 4, `4 patterns returned (got ${patterns.length})`);

  const ids = patterns.map(p => p.patternId);
  assert(ids.includes('BUST_OUT'), 'Contains BUST_OUT pattern');
  assert(ids.includes('TRIANGULATION'), 'Contains TRIANGULATION pattern');
  assert(ids.includes('ATO_ESCALATION'), 'Contains ATO_ESCALATION pattern');
  assert(ids.includes('SLOW_BURN'), 'Contains SLOW_BURN pattern');

  // ──────────────────────────────────────────────────
  // Test 2: Pattern structure validation
  // ──────────────────────────────────────────────────
  console.log('\nTest 2: Pattern structure');
  for (const p of patterns) {
    assert(typeof p.patternId === 'string' && p.patternId.length > 0, `${p.patternId} has patternId`);
    assert(typeof p.name === 'string' && p.name.length > 0, `${p.patternId} has name`);
    assert(typeof p.description === 'string' && p.description.length > 0, `${p.patternId} has description`);
    assert(Array.isArray(p.sequence) && p.sequence.length > 0, `${p.patternId} has non-empty sequence array`);
    assert(typeof p.maxDurationDays === 'number' && p.maxDurationDays > 0, `${p.patternId} has maxDurationDays`);
    assert(typeof p.minConfidence === 'number' && p.minConfidence >= 0 && p.minConfidence <= 1, `${p.patternId} has minConfidence in [0,1]`);
    assert(typeof p.severity === 'string', `${p.patternId} has severity`);
    assert(typeof p.expectedAction === 'string', `${p.patternId} has expectedAction`);
  }

  // ──────────────────────────────────────────────────
  // Test 3: Sequence step structure
  // ──────────────────────────────────────────────────
  console.log('\nTest 3: Sequence step structure');
  for (const p of patterns) {
    for (let i = 0; i < p.sequence.length; i++) {
      const step = p.sequence[i];
      assert(typeof step.domain === 'string' && step.domain.length > 0, `${p.patternId} step ${i} has domain`);
      assert(Array.isArray(step.eventTypes) && step.eventTypes.length > 0, `${p.patternId} step ${i} has eventTypes array`);
      assert(typeof step.label === 'string' && step.label.length > 0, `${p.patternId} step ${i} has label`);
    }
  }

  // ──────────────────────────────────────────────────
  // Test 4: Full bust-out match
  // ──────────────────────────────────────────────────
  console.log('\nTest 4: Full bust-out match');
  const bustOutTimeline = [
    evt('onboarding', 'SELLER_APPROVED', 0, 10),
    evt('account_setup', 'ACCOUNT_SETUP_OK', 2, 10),
    evt('listing', 'LISTING_APPROVED', 5, 20),
    evt('transaction', 'VELOCITY_SPIKE', 30, 80),
    evt('profile_updates', 'BANK_CHANGE_DURING_DISPUTE', 40, 90),
    evt('payout', 'PAYOUT_VELOCITY_SPIKE', 50, 95)
  ];

  const bustOutResults = matchSellerTimeline(bustOutTimeline, patterns);
  const bustOutMatch = bustOutResults.find(r => r.patternId === 'BUST_OUT');
  assert(bustOutMatch !== undefined, 'BUST_OUT pattern matched');
  assert(bustOutMatch.matchScore > 0.7, `matchScore > 0.7 (got ${bustOutMatch?.matchScore?.toFixed(3)})`);
  assert(bustOutMatch.stepsCompleted >= 4, `stepsCompleted >= 4 (got ${bustOutMatch?.stepsCompleted})`);
  assert(bustOutMatch.stepsCompleted === 6, `All 6 steps completed (got ${bustOutMatch?.stepsCompleted})`);

  // ──────────────────────────────────────────────────
  // Test 5: Partial match (only first 3 bust-out steps)
  // ──────────────────────────────────────────────────
  console.log('\nTest 5: Partial match');
  const partialTimeline = [
    evt('onboarding', 'SELLER_APPROVED', 0, 10),
    evt('account_setup', 'ACCOUNT_SETUP_OK', 2, 10),
    evt('listing', 'LISTING_APPROVED', 5, 20)
  ];

  const partialResults = matchSellerTimeline(partialTimeline, patterns);
  const partialBustOut = partialResults.find(r => r.patternId === 'BUST_OUT');
  assert(partialBustOut !== undefined, 'Partial BUST_OUT matched (>= 2 steps)');
  assert(partialBustOut.matchScore < bustOutMatch.matchScore, `Partial score (${partialBustOut?.matchScore?.toFixed(3)}) < full score (${bustOutMatch?.matchScore?.toFixed(3)})`);
  assert(partialBustOut.stepsRemaining > 0, `stepsRemaining > 0 (got ${partialBustOut?.stepsRemaining})`);
  assert(partialBustOut.stepsCompleted === 3, `stepsCompleted === 3 (got ${partialBustOut?.stepsCompleted})`);

  // ──────────────────────────────────────────────────
  // Test 6: No match — clean seller
  // ──────────────────────────────────────────────────
  console.log('\nTest 6: No match — clean seller');
  const cleanTimeline = [
    evt('onboarding', 'SELLER_APPROVED', 0, 5),
    evt('account_setup', 'ACCOUNT_SETUP_OK', 1, 5)
  ];

  const cleanResults = matchSellerTimeline(cleanTimeline, patterns);
  const highScoreMatches = cleanResults.filter(r => r.matchScore >= 0.5);
  assert(highScoreMatches.length === 0, `No high-score matches for clean seller (got ${highScoreMatches.length} with score >= 0.5)`);

  // ──────────────────────────────────────────────────
  // Test 7: ATO escalation — 3 events within 3 days
  // ──────────────────────────────────────────────────
  console.log('\nTest 7: ATO escalation detection');
  const atoTimeline = [
    evt('ato', 'NEW_DEVICE_LOGIN', 0, 85),
    evt('profile_updates', 'BANK_CHANGE_DURING_DISPUTE', 1, 90),
    evt('payout', 'PAYOUT_VELOCITY_SPIKE', 2, 95)
  ];

  const atoResults = matchSellerTimeline(atoTimeline, patterns);
  const atoMatch = atoResults.find(r => r.patternId === 'ATO_ESCALATION');
  assert(atoMatch !== undefined, 'ATO_ESCALATION pattern matched');
  assert(atoMatch.stepsCompleted === 3, `All 3 ATO steps completed (got ${atoMatch?.stepsCompleted})`);
  assert(atoMatch.matchScore > 0.7, `ATO matchScore > 0.7 (got ${atoMatch?.matchScore?.toFixed(3)})`);
  assert(atoMatch.severity === 'CRITICAL', `Severity is CRITICAL (got ${atoMatch?.severity})`);
  assert(atoMatch.expectedAction === 'SUSPEND', `Expected action is SUSPEND (got ${atoMatch?.expectedAction})`);

  // ──────────────────────────────────────────────────
  // Test 8: Timing constraint — ATO events spread over 30 days
  // ──────────────────────────────────────────────────
  console.log('\nTest 8: Timing constraint — ATO spread over 30 days');
  const atoSlowTimeline = [
    evt('ato', 'NEW_DEVICE_LOGIN', 0, 85),
    evt('profile_updates', 'BANK_CHANGE_DURING_DISPUTE', 15, 90),
    evt('payout', 'PAYOUT_VELOCITY_SPIKE', 30, 95)
  ];

  const atoSlowResults = matchSellerTimeline(atoSlowTimeline, patterns);
  const atoSlowMatch = atoSlowResults.find(r => r.patternId === 'ATO_ESCALATION');
  assert(atoSlowMatch !== undefined, 'ATO_ESCALATION still matches when spread');
  assert(atoSlowMatch.matchScore < atoMatch.matchScore, `Spread score (${atoSlowMatch?.matchScore?.toFixed(3)}) < compressed score (${atoMatch?.matchScore?.toFixed(3)})`);

  // ──────────────────────────────────────────────────
  // Test 9: Match result structure
  // ──────────────────────────────────────────────────
  console.log('\nTest 9: Match result structure');
  // Reuse bustOutMatch from Test 4
  assert(typeof bustOutMatch.patternId === 'string', 'Result has patternId (string)');
  assert(typeof bustOutMatch.patternName === 'string', 'Result has patternName (string)');
  assert(typeof bustOutMatch.matchScore === 'number', 'Result has matchScore (number)');
  assert(bustOutMatch.matchScore >= 0 && bustOutMatch.matchScore <= 1, `matchScore in [0,1] (got ${bustOutMatch.matchScore})`);
  assert(typeof bustOutMatch.stepsCompleted === 'number', 'Result has stepsCompleted (number)');
  assert(typeof bustOutMatch.stepsRemaining === 'number', 'Result has stepsRemaining (number)');
  assert(typeof bustOutMatch.severity === 'string', 'Result has severity (string)');
  assert(Array.isArray(bustOutMatch.matchedSteps), 'Result has matchedSteps (array)');
  assert(bustOutMatch.matchedSteps.length > 0, 'matchedSteps is non-empty');

  // Verify individual matched step structure
  const firstStep = bustOutMatch.matchedSteps[0];
  assert(typeof firstStep.stepIndex === 'number', 'matchedStep has stepIndex');
  assert(typeof firstStep.domain === 'string', 'matchedStep has domain');
  assert(typeof firstStep.eventType === 'string', 'matchedStep has eventType');
  assert(firstStep.createdAt !== undefined, 'matchedStep has createdAt');
  assert(typeof firstStep.riskScore === 'number', 'matchedStep has riskScore');

  // ── Summary ──
  console.log(`\n${'═'.repeat(50)}`);
  console.log(`Results: ${passed} passed, ${failed} failed, ${passed + failed} total`);
  console.log(`${'═'.repeat(50)}`);

  if (failed > 0) {
    process.exit(1);
  }
}

runTests();
