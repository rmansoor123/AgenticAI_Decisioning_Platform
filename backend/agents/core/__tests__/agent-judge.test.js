/**
 * Agent Judge Tests
 * Tests cross-agent evaluation system, judge selection, and rule-based evaluation.
 *
 * Run with: node backend/agents/core/__tests__/agent-judge.test.js
 */

import assert from 'node:assert';
import { getAgentJudge } from '../agent-judge.js';

const judge = getAgentJudge();

// ── Test: Judge selection cross-evaluates ──

function testJudgeSelection() {
  assert.strictEqual(
    judge.selectJudge('SELLER_ONBOARDING'),
    'FRAUD_INVESTIGATOR',
    'Seller onboarding should be judged by fraud investigator'
  );
  assert.strictEqual(
    judge.selectJudge('FRAUD_INVESTIGATOR'),
    'SELLER_ONBOARDING',
    'Fraud investigator should be judged by seller onboarding'
  );
  assert.strictEqual(
    judge.selectJudge('ALERT_TRIAGE'),
    'FRAUD_INVESTIGATOR',
    'Alert triage should be judged by fraud investigator'
  );
  assert.strictEqual(
    judge.selectJudge('UNKNOWN_AGENT'),
    'FRAUD_INVESTIGATOR',
    'Unknown agents default to fraud investigator judge'
  );
  console.log('  [PASS] Judge selection cross-evaluates correctly');
}

// ── Test: Well-supported REJECT upheld ──

async function testWellSupportedReject() {
  const thought = {
    result: {
      recommendation: { action: 'REJECT' },
      decision: 'REJECT',
      riskScore: 85,
      confidence: 0.9,
      reasoning: 'Multiple fraud indicators found',
      citations: [
        { claim: 'IP flagged', toolName: 'check_ip', confidence: 0.9 },
        { claim: 'Velocity spike', toolName: 'check_velocity', confidence: 0.8 },
        { claim: 'Doc mismatch', toolName: 'verify_identity', confidence: 0.9 },
      ],
    },
    actions: [
      { action: { type: 'check_ip' }, result: { success: true, data: { flagged: true } } },
      { action: { type: 'check_velocity' }, result: { success: true, data: { velocity: 'HIGH' } } },
      { action: { type: 'verify_identity' }, result: { success: true, data: { verified: false } } },
    ],
    reflection: { concerns: [] },
  };

  const review = await judge.evaluate(thought, 'SELLER_ONBOARDING');
  assert.ok(review.quality >= 0.5, `Quality should be at least 0.5, got ${review.quality}`);
  assert.ok(['uphold', 'review'].includes(review.recommendation),
    `Well-supported REJECT should be upheld or reviewed, got ${review.recommendation}`);
  console.log('  [PASS] Well-supported REJECT upheld');
}

// ── Test: Poorly supported REJECT overturned or reviewed ──

async function testPoorlySupportedReject() {
  const thought = {
    result: {
      recommendation: { action: 'REJECT' },
      decision: 'REJECT',
      riskScore: 20,
      confidence: 0.95,
      reasoning: 'Rejected',
      citations: [],
    },
    actions: [
      { action: { type: 'analyze' }, result: { success: false, data: null } },
    ],
    reflection: { concerns: ['Evidence is contradictory'] },
  };

  const review = await judge.evaluate(thought, 'FRAUD_INVESTIGATOR');
  assert.ok(review.quality < 0.7, `Quality should be below 0.7, got ${review.quality}`);
  assert.ok(['overturn', 'review'].includes(review.recommendation),
    `Poorly supported REJECT should be overturned or reviewed, got ${review.recommendation}`);
  assert.ok(review.issues.length > 0, 'Should identify issues');
  console.log('  [PASS] Poorly supported REJECT flagged');
}

// ── Test: APPROVE with high risk flagged ──

async function testHighRiskApprove() {
  const thought = {
    result: {
      recommendation: { action: 'APPROVE' },
      decision: 'APPROVE',
      riskScore: 90,
      confidence: 0.7,
      reasoning: 'Approved despite high risk',
      citations: [],
    },
    actions: [
      { action: { type: 'analyze' }, result: { success: true, data: { riskLevel: 'HIGH' } } },
    ],
    reflection: { concerns: [] },
  };

  const review = await judge.evaluate(thought, 'SELLER_ONBOARDING');
  assert.ok(review.issues.length > 0, 'Should flag high-risk APPROVE');
  console.log('  [PASS] High-risk APPROVE flagged');
}

// ── Test: Stats tracking ──

async function testStatsTracking() {
  const stats = judge.getStats();
  assert.ok(stats.totalEvaluations >= 3, `Should have at least 3 evaluations, got ${stats.totalEvaluations}`);
  assert.ok(typeof stats.upheld === 'number', 'Should track upheld count');
  assert.ok(typeof stats.overturned === 'number', 'Should track overturned count');
  assert.ok(typeof stats.sentToReview === 'number', 'Should track review count');
  console.log('  [PASS] Stats tracking');
}

// ── Run All ──

async function run() {
  console.log('Agent Judge Tests');
  console.log('=================');

  let passed = 0;
  let failed = 0;

  const tests = [
    testJudgeSelection,
    testWellSupportedReject,
    testPoorlySupportedReject,
    testHighRiskApprove,
    testStatsTracking,
  ];

  for (const test of tests) {
    try {
      await test();
      passed++;
    } catch (err) {
      failed++;
      console.error(`  [FAIL] ${test.name}: ${err.message}`);
    }
  }

  console.log(`\nResults: ${passed} passed, ${failed} failed out of ${tests.length}`);
  if (failed > 0) process.exit(1);
}

run().catch(err => {
  console.error('Test runner error:', err);
  process.exit(1);
});
