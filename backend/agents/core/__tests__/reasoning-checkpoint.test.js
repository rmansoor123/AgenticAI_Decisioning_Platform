/**
 * Reasoning Checkpoint Tests
 * Tests TPAOR checkpointing and human-in-the-loop patterns.
 *
 * Run with: node backend/agents/core/__tests__/reasoning-checkpoint.test.js
 */

import assert from 'node:assert';
import { getReasoningCheckpoint } from '../reasoning-checkpoint.js';

const checkpoint = getReasoningCheckpoint();

// ── Test: Save and load checkpoint ──

function testSaveAndLoad() {
  const sessionId = 'TEST-SESSION-001';
  checkpoint.save(sessionId, 'TEST_AGENT', 'think', { hypothesis: 'suspicious activity' });

  const loaded = checkpoint.load(sessionId);
  assert.ok(loaded, 'Should load saved checkpoint');
  assert.strictEqual(loaded.phase, 'think', 'Phase should match');
  assert.strictEqual(loaded.state.hypothesis, 'suspicious activity', 'State should match');
  assert.strictEqual(loaded.agentId, 'TEST_AGENT', 'Agent ID should match');

  checkpoint.clear(sessionId);
  console.log('  [PASS] Save and load checkpoint');
}

// ── Test: Load returns latest phase ──

function testLatestPhase() {
  const sessionId = 'TEST-SESSION-002';
  checkpoint.save(sessionId, 'TEST_AGENT', 'think', { step: 1 });
  checkpoint.save(sessionId, 'TEST_AGENT', 'plan', { step: 2 });
  checkpoint.save(sessionId, 'TEST_AGENT', 'act', { step: 3 });

  const loaded = checkpoint.load(sessionId);
  assert.strictEqual(loaded.phase, 'act', 'Should return latest saved phase');

  checkpoint.clear(sessionId);
  console.log('  [PASS] Load returns latest phase');
}

// ── Test: Load all returns ordered phases ──

function testLoadAll() {
  const sessionId = 'TEST-SESSION-003';
  checkpoint.save(sessionId, 'TEST_AGENT', 'think', { s: 1 });
  checkpoint.save(sessionId, 'TEST_AGENT', 'plan', { s: 2 });
  checkpoint.save(sessionId, 'TEST_AGENT', 'observe', { s: 3 });

  const all = checkpoint.loadAll(sessionId);
  assert.strictEqual(all.length, 3, 'Should have 3 checkpoints');
  assert.strictEqual(all[0].phase, 'think', 'First should be think');
  assert.strictEqual(all[1].phase, 'plan', 'Second should be plan');
  assert.strictEqual(all[2].phase, 'observe', 'Third should be observe');

  checkpoint.clear(sessionId);
  console.log('  [PASS] Load all returns ordered phases');
}

// ── Test: Clear removes all checkpoints ──

function testClear() {
  const sessionId = 'TEST-SESSION-004';
  checkpoint.save(sessionId, 'TEST_AGENT', 'think', { data: 'test' });
  checkpoint.save(sessionId, 'TEST_AGENT', 'plan', { data: 'test' });

  checkpoint.clear(sessionId);
  const loaded = checkpoint.load(sessionId);
  assert.strictEqual(loaded, null, 'Should return null after clear');
  console.log('  [PASS] Clear removes all checkpoints');
}

// ── Test: Can resume check ──

function testCanResume() {
  const sessionId = 'TEST-SESSION-005';

  const noResume = checkpoint.canResume(sessionId);
  assert.strictEqual(noResume.resumable, false, 'Should not be resumable without checkpoint');

  checkpoint.save(sessionId, 'TEST_AGENT', 'observe', { risk: 'high' });
  const canResume = checkpoint.canResume(sessionId);
  assert.strictEqual(canResume.resumable, true, 'Should be resumable with checkpoint');
  assert.strictEqual(canResume.phase, 'observe', 'Should report current phase');

  checkpoint.clear(sessionId);
  console.log('  [PASS] Can resume check');
}

// ── Test: Non-existent session returns null ──

function testNonExistent() {
  const loaded = checkpoint.load('NONEXISTENT-SESSION');
  assert.strictEqual(loaded, null, 'Should return null for non-existent session');
  console.log('  [PASS] Non-existent session returns null');
}

// ── Test: Stats tracking ──

function testStats() {
  const stats = checkpoint.getStats();
  assert.ok(stats.saved >= 8, `Should have saved at least 8 checkpoints, got ${stats.saved}`);
  assert.ok(stats.loaded >= 3, `Should have loaded at least 3, got ${stats.loaded}`);
  console.log('  [PASS] Stats tracking');
}

// ── Test: Human-in-the-loop interrupt ──

async function testInterrupt() {
  const { default: BaseAgent } = await import('../base-agent.js');
  const agent = new BaseAgent({
    agentId: 'HITL_TEST',
    name: 'HITL Test Agent',
    role: 'Test agent for human-in-the-loop',
  });

  const traceId = 'TRACE-HITL-TEST-001';
  checkpoint.save(traceId, 'HITL_TEST', 'observe', {
    input: { type: 'test' },
    decision: 'REVIEW',
    riskScore: 75,
  });

  const result = await agent.interruptReasoning(traceId, 'analyst_review');
  assert.ok(result.success, 'Interrupt should succeed');
  assert.strictEqual(result.interruptedPhase, 'observe', 'Should report interrupted phase');
  assert.strictEqual(result.resumeToken, traceId, 'Should return resume token');

  checkpoint.clear(traceId);
  console.log('  [PASS] Human-in-the-loop interrupt');
}

// ── Run All ──

async function run() {
  console.log('Reasoning Checkpoint Tests');
  console.log('=========================');

  let passed = 0;
  let failed = 0;

  const tests = [
    testSaveAndLoad,
    testLatestPhase,
    testLoadAll,
    testClear,
    testCanResume,
    testNonExistent,
    testStats,
    testInterrupt,
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
