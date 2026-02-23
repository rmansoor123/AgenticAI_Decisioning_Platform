/**
 * Integration test: verifies reflect() and eval tracking work within the reasoning loop.
 * Run with: node backend/agents/core/__tests__/reflect-and-eval.test.js
 */

import { BaseAgent } from '../base-agent.js';
import { getEvalTracker } from '../eval-tracker.js';

async function runTests() {
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

  // ── Test 1: reflect() returns valid structure (rule-based fallback) ──
  console.log('\nTest 1: reflect() rule-based fallback');
  const agent = new BaseAgent({
    agentId: 'TEST-REFLECT',
    name: 'Test Agent',
    role: 'test agent',
    capabilities: ['testing']
  });

  // Mock observation with misaligned risk/decision
  const observation = {
    recommendation: { action: 'APPROVE', reason: 'Looks fine' },
    decision: 'APPROVE',
    riskScore: 75,
    confidence: 0.9
  };
  const actions = [
    { action: { type: 'check_a' }, result: { success: true, data: { riskLevel: 'HIGH' } } },
    { action: { type: 'check_b' }, result: { success: false, data: {} } }
  ];

  const reflection = await agent.reflect(observation, actions, { sellerId: 'S1' }, {});

  assert(typeof reflection.shouldRevise === 'boolean', 'shouldRevise is boolean');
  assert(Array.isArray(reflection.concerns), 'concerns is array');
  assert(reflection.concerns.length > 0, 'concerns detected for misaligned decision');
  assert(typeof reflection.contraArgument === 'string', 'contraArgument is string');
  assert(typeof reflection.reflectionConfidence === 'number', 'reflectionConfidence is number');

  // ── Test 2: reflect() detects risk-decision misalignment ──
  console.log('\nTest 2: reflect() catches risk-decision misalignment');
  assert(
    reflection.concerns.some(c => c.includes('Risk score') || c.includes('elevated')),
    'Detected risk score vs APPROVE misalignment'
  );

  // ── Test 3: reflect() returns no revision for clean case ──
  console.log('\nTest 3: reflect() passes clean decisions');
  const cleanObs = {
    recommendation: { action: 'APPROVE', reason: 'All clear' },
    decision: 'APPROVE',
    riskScore: 15,
    confidence: 0.85
  };
  const cleanActions = [
    { action: { type: 'verify_id' }, result: { success: true, data: { verified: true, riskLevel: 'LOW' } } },
    { action: { type: 'verify_email' }, result: { success: true, data: { verified: true, riskLevel: 'LOW' } } },
    { action: { type: 'verify_biz' }, result: { success: true, data: { verified: true, riskLevel: 'LOW' } } }
  ];

  const cleanReflection = await agent.reflect(cleanObs, cleanActions, { sellerId: 'S2' }, {});
  assert(cleanReflection.shouldRevise === false, 'Clean decision not revised');

  // ── Test 4: EvalTracker singleton works ──
  console.log('\nTest 4: EvalTracker basic functionality');
  const tracker = getEvalTracker();
  assert(tracker.stats.totalEvals === 0, 'Starts with zero evals');

  const stats = tracker.getSystemEvalStats();
  assert(stats.totalEvals === 0, 'System stats show zero evals');

  // ── Test 5: _computeAggregate works ──
  console.log('\nTest 5: _computeAggregate');
  const agg = tracker._computeAggregate({ a: 0.8, b: 0.6, c: 0.7 });
  assert(Math.abs(agg - 0.7) < 0.01, `Aggregate is ~0.7, got ${agg}`);

  const emptyAgg = tracker._computeAggregate({});
  assert(emptyAgg === null, 'Empty scores returns null');

  // ── Summary ──
  console.log(`\n${'='.repeat(40)}`);
  console.log(`Results: ${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

runTests().catch(err => {
  console.error('Test runner error:', err);
  process.exit(1);
});
