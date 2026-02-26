/**
 * Tests for multi-turn re-planning logic in BaseAgent.
 * Run with: node backend/agents/core/__tests__/re-planning.test.js
 */

import { BaseAgent } from '../base-agent.js';

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

  const agent = new BaseAgent({
    agentId: 'TEST-REPLAN',
    name: 'Re-Plan Test Agent',
    role: 'test agent',
    capabilities: ['testing']
  });

  // ── Test 1: _replanCount initialised to 0 ──
  console.log('\nTest 1: constructor initialises _replanCount');
  assert(agent._replanCount === 0, '_replanCount starts at 0');

  // ── Test 2: shouldRePlan returns false when no failures ──
  console.log('\nTest 2: shouldRePlan — no failures');
  const allSuccess = [
    { action: { type: 'a' }, result: { success: true } },
    { action: { type: 'b' }, result: { success: true } }
  ];
  assert(agent.shouldRePlan(allSuccess) === false, 'All successes => no re-plan');

  // ── Test 3: shouldRePlan returns false with empty array ──
  console.log('\nTest 3: shouldRePlan — empty actions');
  assert(agent.shouldRePlan([]) === false, 'Empty actions => no re-plan');

  // ── Test 4: shouldRePlan returns true when >50% failures ──
  console.log('\nTest 4: shouldRePlan — >50% failures');
  const majorityFail = [
    { action: { type: 'a' }, result: { success: false } },
    { action: { type: 'b' }, result: { success: false } },
    { action: { type: 'c' }, result: { success: true } }
  ];
  assert(agent.shouldRePlan(majorityFail) === true, '2/3 failures => re-plan');

  // ── Test 5: shouldRePlan returns true when exactly 50% fail (>50% means more than half) ──
  console.log('\nTest 5: shouldRePlan — exactly 50% failures');
  const halfFail = [
    { action: { type: 'a' }, result: { success: false } },
    { action: { type: 'b' }, result: { success: true } }
  ];
  assert(halfFail.filter(a => a.result.success === false).length / halfFail.length === 0.5, 'Sanity: 50% failed');
  // >50% means strictly more than half, so 50% should be false
  assert(agent.shouldRePlan(halfFail) === false, 'Exactly 50% failures => no re-plan (need >50%)');

  // ── Test 6: shouldRePlan returns false after already replanned ──
  console.log('\nTest 6: shouldRePlan — already replanned');
  const agent2 = new BaseAgent({
    agentId: 'TEST-REPLAN-2',
    name: 'Re-Plan Test Agent 2',
    role: 'test agent',
    capabilities: ['testing']
  });
  agent2._replanCount = 1; // already replanned once
  assert(agent2.shouldRePlan(majorityFail) === false, 'Already replanned => no re-plan');

  // ── Test 7: shouldRePlan handles all-fail case ──
  console.log('\nTest 7: shouldRePlan — 100% failure');
  const allFail = [
    { action: { type: 'x' }, result: { success: false } },
    { action: { type: 'y' }, result: { success: false } }
  ];
  assert(agent.shouldRePlan(allFail) === true, 'All failures => re-plan');

  // ── Test 8: buildRePlanPrompt returns proper structure ──
  console.log('\nTest 8: buildRePlanPrompt returns { system, user }');
  const successes = [{ action: { type: 'check_a' }, result: { success: true, data: { status: 'ok' } } }];
  const failures = [{ action: { type: 'check_b' }, result: { success: false, error: 'timeout' } }];
  const prompt = agent.buildRePlanPrompt('Investigate seller S-123', successes, failures);

  assert(typeof prompt === 'object' && prompt !== null, 'Returns an object');
  assert(typeof prompt.system === 'string' && prompt.system.length > 0, 'Has non-empty system prompt');
  assert(typeof prompt.user === 'string' && prompt.user.length > 0, 'Has non-empty user prompt');
  assert(prompt.system.includes(agent.name) || prompt.system.includes(agent.role), 'System prompt references agent identity');
  assert(prompt.user.includes('Investigate seller S-123'), 'User prompt includes the original goal');

  // ── Test 9: buildRePlanPrompt mentions failures ──
  console.log('\nTest 9: buildRePlanPrompt references failures in user prompt');
  assert(prompt.user.includes('check_b'), 'User prompt mentions failed action');

  // ── Test 10: buildRePlanPrompt mentions available tools ──
  console.log('\nTest 10: buildRePlanPrompt mentions tools');
  // Register a tool for this test
  agent.registerTool('verify_identity', 'Verify seller identity', async () => ({ success: true }));
  const prompt2 = agent.buildRePlanPrompt('Check seller', [], failures);
  assert(prompt2.user.includes('verify_identity'), 'User prompt lists available tools');

  // ── Summary ──
  console.log(`\n${'='.repeat(40)}`);
  console.log(`Results: ${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

runTests().catch(err => {
  console.error('Test runner error:', err);
  process.exit(1);
});
