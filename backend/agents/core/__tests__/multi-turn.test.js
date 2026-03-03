/**
 * Multi-Turn Investigation Tests
 * Tests _shouldDeepenInvestigation logic and follow-up planning.
 *
 * Run with: node backend/agents/core/__tests__/multi-turn.test.js
 */

import assert from 'node:assert';
import { BaseAgent } from '../base-agent.js';

// Create a minimal test agent
function createTestAgent() {
  const agent = new BaseAgent({
    agentId: 'MULTI_TURN_TEST',
    name: 'Multi-Turn Test Agent',
    role: 'Test agent for multi-turn investigation',
  });
  agent.registerTool('analyze', 'Analyze data', async () => ({ success: true, data: { score: 50 } }));
  agent.registerTool('verify_identity', 'Verify identity', async () => ({ success: true, data: { verified: true } }));
  agent.registerTool('check_velocity', 'Check velocity', async () => ({ success: true, data: { velocity: 'normal' } }));
  return agent;
}

// ── Test: Low confidence triggers deepening ──

function testLowConfidenceDeepens() {
  const agent = createTestAgent();
  const thought = {
    result: { confidence: 0.3, riskScore: 50 },
    actions: [
      { action: { type: 'analyze' }, result: { success: true, data: {} } },
      { action: { type: 'verify_identity' }, result: { success: true, data: {} } },
    ],
  };
  const reflection = { concerns: [], contraArgument: '' };

  const shouldDeepen = agent._shouldDeepenInvestigation(thought, reflection);
  assert.strictEqual(shouldDeepen, true, 'Low confidence should trigger deepening');
  console.log('  [PASS] Low confidence triggers deepening');
}

// ── Test: Many concerns trigger deepening ──

function testManyConcernsDeepens() {
  const agent = createTestAgent();
  const thought = {
    result: { confidence: 0.7, riskScore: 50 },
    actions: [
      { action: { type: 'analyze' }, result: { success: true, data: {} } },
      { action: { type: 'verify_identity' }, result: { success: true, data: {} } },
      { action: { type: 'check_velocity' }, result: { success: true, data: {} } },
    ],
  };
  const reflection = {
    concerns: ['Concern A', 'Concern B', 'Concern C'],
    contraArgument: 'Multiple issues found',
  };

  const shouldDeepen = agent._shouldDeepenInvestigation(thought, reflection);
  assert.strictEqual(shouldDeepen, true, '3+ concerns should trigger deepening');
  console.log('  [PASS] Many concerns trigger deepening');
}

// ── Test: High risk with thin evidence triggers deepening ──

function testThinEvidenceDeepens() {
  const agent = createTestAgent();
  const thought = {
    result: { confidence: 0.6, riskScore: 80 },
    actions: [
      { action: { type: 'analyze' }, result: { success: true, data: { riskLevel: 'HIGH' } } },
    ],
  };
  const reflection = { concerns: [], contraArgument: '' };

  const shouldDeepen = agent._shouldDeepenInvestigation(thought, reflection);
  assert.strictEqual(shouldDeepen, true, 'High risk + thin evidence should deepen');
  console.log('  [PASS] High risk with thin evidence triggers deepening');
}

// ── Test: Confident with enough evidence doesn't deepen ──

function testConfidentNoDeepen() {
  const agent = createTestAgent();
  const thought = {
    result: { confidence: 0.85, riskScore: 40 },
    actions: [
      { action: { type: 'analyze' }, result: { success: true, data: {} } },
      { action: { type: 'verify_identity' }, result: { success: true, data: {} } },
      { action: { type: 'check_velocity' }, result: { success: true, data: {} } },
    ],
  };
  const reflection = { concerns: ['Minor note'], contraArgument: 'No significant issues.' };

  const shouldDeepen = agent._shouldDeepenInvestigation(thought, reflection);
  assert.strictEqual(shouldDeepen, false, 'Confident + sufficient evidence should not deepen');
  console.log('  [PASS] Confident + sufficient evidence does not deepen');
}

// ── Test: "missing evidence" in reflection triggers deepening ──

function testMissingEvidenceInReflection() {
  const agent = createTestAgent();
  const thought = {
    result: { confidence: 0.6, riskScore: 50 },
    actions: [
      { action: { type: 'analyze' }, result: { success: true, data: {} } },
      { action: { type: 'verify_identity' }, result: { success: true, data: {} } },
      { action: { type: 'check_velocity' }, result: { success: true, data: {} } },
    ],
  };
  const reflection = {
    concerns: ['One concern'],
    contraArgument: 'There is missing evidence for the chargeback claim',
  };

  const shouldDeepen = agent._shouldDeepenInvestigation(thought, reflection);
  assert.strictEqual(shouldDeepen, true, '"missing evidence" in reflection should deepen');
  console.log('  [PASS] Missing evidence keyword triggers deepening');
}

// ── Test: Follow-up plan uses unused tools ──

async function testFollowUpPlan() {
  const agent = createTestAgent();
  const thought = {
    result: { confidence: 0.3, summary: 'Uncertain findings' },
    actions: [
      { action: { type: 'analyze' }, result: { success: true, data: {} } },
    ],
  };
  const reflection = { concerns: ['Need more data'] };

  const plan = await agent._planFollowUp(thought, reflection, {});
  assert.ok(plan.actions.length > 0, 'Follow-up plan should have actions');
  // Should not re-use 'analyze' since it was already used
  assert.ok(
    plan.actions.every(a => a.type !== 'analyze'),
    'Follow-up should use tools not already used'
  );
  console.log('  [PASS] Follow-up plan uses unused tools');
}

// ── Run All ──

async function run() {
  console.log('Multi-Turn Investigation Tests');
  console.log('==============================');

  let passed = 0;
  let failed = 0;

  const tests = [
    testLowConfidenceDeepens,
    testManyConcernsDeepens,
    testThinEvidenceDeepens,
    testConfidentNoDeepen,
    testMissingEvidenceInReflection,
    testFollowUpPlan,
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
