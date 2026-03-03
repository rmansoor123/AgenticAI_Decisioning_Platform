/**
 * Dynamic Agent Spawning Tests
 *
 * Run with: node backend/agents/core/__tests__/dynamic-spawning.test.js
 */

import assert from 'node:assert';
import { orchestrator } from '../agent-orchestrator.js';

// -- Test: Get spawnable types --

function testSpawnableTypes() {
  const types = orchestrator.getSpawnableTypes();
  assert.ok(Array.isArray(types), 'Should return array');
  assert.ok(types.length >= 10, `Should have at least 10 types, got ${types.length}`);
  assert.ok(types.every(t => t.type && t.description), 'Each should have type and description');
  console.log('  [PASS] Get spawnable types');
}

// -- Test: Spawn agent --

async function testSpawnAgent() {
  const agent = await orchestrator.spawnAgent('seller_onboarding', {
    agentId: 'SPAWN-TEST-001',
  });
  assert.ok(agent, 'Should spawn agent');
  assert.ok(orchestrator.getAgent('SPAWN-TEST-001'), 'Should be registered');
  console.log('  [PASS] Spawn agent');
}

// -- Test: Spawned agent can reason --

async function testSpawnedAgentReason() {
  const agent = orchestrator.getAgent('SPAWN-TEST-001');
  assert.ok(agent, 'Agent should exist');

  const result = await agent.reason({
    type: 'seller_application',
    sellerId: 'SELLER-SPAWN-TEST',
    businessName: 'Test Business',
    businessAge: 5,
    annualRevenue: 500000,
  });
  assert.ok(result.result, 'Should produce a result');
  console.log('  [PASS] Spawned agent can reason');
}

// -- Test: Despawn agent --

async function testDespawnAgent() {
  const result = await orchestrator.despawnAgent('SPAWN-TEST-001');
  assert.ok(result.success, 'Should despawn successfully');
  assert.ok(!orchestrator.getAgent('SPAWN-TEST-001'), 'Should no longer be registered');
  console.log('  [PASS] Despawn agent');
}

// -- Test: Spawn unknown type throws --

async function testSpawnUnknownType() {
  try {
    await orchestrator.spawnAgent('nonexistent_agent_type');
    assert.fail('Should throw for unknown type');
  } catch (err) {
    assert.ok(err.message.includes('Unknown agent type'), 'Error should mention unknown type');
  }
  console.log('  [PASS] Spawn unknown type throws');
}

// -- Test: Spawn multiple agents --

async function testSpawnMultiple() {
  const results = await orchestrator.spawnAgents([
    { type: 'fraud_investigation', config: { agentId: 'MULTI-SPAWN-1' } },
    { type: 'alert_triage', config: { agentId: 'MULTI-SPAWN-2' } },
  ]);

  assert.strictEqual(results.length, 2, 'Should have 2 results');
  const succeeded = results.filter(r => r.status === 'fulfilled');
  assert.ok(succeeded.length >= 1, 'At least one should succeed');

  // Clean up
  for (const r of results) {
    if (r.agent) await orchestrator.despawnAgent(r.agent.agentId);
  }
  console.log('  [PASS] Spawn multiple agents');
}

// -- Run All --

async function run() {
  console.log('Dynamic Agent Spawning Tests');
  console.log('============================');

  let passed = 0;
  let failed = 0;

  const tests = [
    testSpawnableTypes,
    testSpawnAgent,
    testSpawnedAgentReason,
    testDespawnAgent,
    testSpawnUnknownType,
    testSpawnMultiple,
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
