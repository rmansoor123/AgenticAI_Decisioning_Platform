/**
 * Online Evaluation & A/B Testing Tests
 *
 * Run with: node backend/agents/core/__tests__/online-eval.test.js
 */

import assert from 'node:assert';
import { getEvalTracker, getOnlineEvaluator } from '../eval-tracker.js';

const tracker = getEvalTracker();
const online = getOnlineEvaluator();

// ── Test: Record decisions ──

function testRecordDecisions() {
  for (let i = 0; i < 20; i++) {
    online.recordDecision('TEST_AGENT', {
      action: i < 15 ? 'APPROVE' : 'REJECT',
      confidence: 0.7 + (i * 0.01),
      riskScore: 30 + i,
    });
  }
  const snapshot = online.getSnapshot('TEST_AGENT');
  assert.ok(snapshot.hasData, 'Should have data');
  assert.strictEqual(snapshot.windows.hour.count, 20, 'Should have 20 entries');
  console.log('  [PASS] Record decisions');
}

// ── Test: Decision distribution ──

function testDistribution() {
  const snapshot = online.getSnapshot('TEST_AGENT');
  assert.ok(snapshot.windows.hour.distribution.APPROVE > 0.5, 'APPROVE should be majority');
  assert.ok(snapshot.windows.hour.distribution.REJECT > 0, 'REJECT should be present');
  console.log('  [PASS] Decision distribution');
}

// ── Test: Anomaly detection ──

function testAnomalyDetection() {
  for (let i = 0; i < 15; i++) {
    online.recordDecision('ANOMALY_AGENT', {
      action: 'APPROVE',
      confidence: 0.8,
      riskScore: 30,
    });
  }
  for (let i = 0; i < 10; i++) {
    online.recordDecision('ANOMALY_AGENT', {
      action: 'REJECT',
      confidence: 0.4,
      riskScore: 80,
    });
  }
  const alerts = online.getRecentAlerts();
  assert.ok(Array.isArray(alerts), 'Should return alerts array');
  console.log('  [PASS] Anomaly detection runs without errors');
}

// ── Test: Stats tracking ──

function testOnlineStats() {
  const stats = online.getStats();
  assert.ok(stats.decisionsTracked >= 20, 'Should track decisions');
  assert.ok(typeof stats.activeAgents === 'number', 'Should track active agents');
  console.log('  [PASS] Online stats tracking');
}

// ── Test: A/B experiment registration ──

function testExperimentRegistration() {
  tracker.registerExperiment('EXP-001', {
    name: 'Confidence threshold test',
    controlStrategy: 'threshold_0.7',
    treatmentStrategy: 'threshold_0.5',
    splitRatio: 0.5,
  });

  const group1 = tracker.assignGroup('EXP-001', 'DEC-AAA-001');
  const group2 = tracker.assignGroup('EXP-001', 'DEC-BBB-002');
  assert.ok(['control', 'treatment'].includes(group1), 'Should assign to valid group');
  assert.ok(['control', 'treatment'].includes(group2), 'Should assign to valid group');
  console.log('  [PASS] A/B experiment registration');
}

// ── Test: Experiment metrics ──

function testExperimentMetrics() {
  for (let i = 0; i < 15; i++) {
    tracker.recordExperimentMetric('EXP-001', 'control', { score: 0.7 + Math.random() * 0.1 });
    tracker.recordExperimentMetric('EXP-001', 'treatment', { score: 0.75 + Math.random() * 0.1 });
  }

  const results = tracker.getExperimentResults('EXP-001');
  assert.ok(results, 'Should return results');
  assert.strictEqual(results.control.count, 15, 'Should have 15 control metrics');
  assert.strictEqual(results.treatment.count, 15, 'Should have 15 treatment metrics');
  assert.ok(results.winner, 'Should determine winner');
  console.log('  [PASS] Experiment metrics and results');
}

// ── Test: End experiment ──

function testEndExperiment() {
  tracker.endExperiment('EXP-001');
  const results = tracker.getExperimentResults('EXP-001');
  assert.strictEqual(results.status, 'completed', 'Should be completed');
  console.log('  [PASS] End experiment');
}

// ── Test: No-data snapshot ──

function testNoDataSnapshot() {
  const snapshot = online.getSnapshot('NONEXISTENT_AGENT');
  assert.strictEqual(snapshot.hasData, false, 'Should have no data for unknown agent');
  console.log('  [PASS] No-data snapshot');
}

// ── Run All ──

async function run() {
  console.log('Online Evaluation & A/B Testing Tests');
  console.log('=====================================');

  let passed = 0;
  let failed = 0;

  const tests = [
    testRecordDecisions,
    testDistribution,
    testAnomalyDetection,
    testOnlineStats,
    testExperimentRegistration,
    testExperimentMetrics,
    testEndExperiment,
    testNoDataSnapshot,
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
