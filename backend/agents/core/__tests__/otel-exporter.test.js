/**
 * OpenTelemetry Exporter Tests
 *
 * Run with: node backend/agents/core/__tests__/otel-exporter.test.js
 */

import assert from 'node:assert';
import { getOTelExporter } from '../otel-exporter.js';

const exporter = getOTelExporter();

// -- Test: Convert trace to OTLP --

function testToOTLP() {
  const trace = {
    traceId: 'TRACE-TEST-abc123',
    agentId: 'SELLER_ONBOARDING',
    startTime: Date.now() - 1000,
    endTime: Date.now(),
    duration: 1000,
    status: 'completed',
    spans: [
      { spanName: 'think', startTime: Date.now() - 900, endTime: Date.now() - 700, status: 'completed', duration: 200, data: '{}' },
      { spanName: 'plan', startTime: Date.now() - 700, endTime: Date.now() - 500, status: 'completed', duration: 200, data: '{}' },
      { spanName: 'act', startTime: Date.now() - 500, endTime: Date.now() - 100, status: 'completed', duration: 400, data: '{}' },
    ],
  };

  const otlp = exporter.toOTLP(trace);
  assert.ok(otlp.resourceSpans, 'Should have resourceSpans');
  assert.strictEqual(otlp.resourceSpans.length, 1, 'Should have one resource');

  const scopeSpans = otlp.resourceSpans[0].scopeSpans;
  assert.ok(scopeSpans.length >= 1, 'Should have scope spans');

  // Root span + 3 child spans = 4 total
  const spans = scopeSpans[0].spans;
  assert.strictEqual(spans.length, 4, 'Should have 4 spans (1 root + 3 children)');

  // Check root span
  assert.ok(spans[0].name.includes('SELLER_ONBOARDING'), 'Root span should include agent ID');

  // Check attributes
  const agentAttr = spans[0].attributes.find(a => a.key === 'agent.id');
  assert.ok(agentAttr, 'Should have agent.id attribute');
  assert.strictEqual(agentAttr.value.stringValue, 'SELLER_ONBOARDING');

  console.log('  [PASS] Convert trace to OTLP');
}

// -- Test: Queue trace --

function testQueueTrace() {
  const trace = {
    traceId: 'TRACE-QUEUE-001',
    agentId: 'TEST_AGENT',
    startTime: Date.now() - 500,
    endTime: Date.now(),
    duration: 500,
    status: 'completed',
    spans: [],
  };

  exporter.queueTrace(trace);
  const stats = exporter.getStats();
  assert.ok(stats.queued >= 1, 'Should track queued traces');
  assert.ok(stats.queueSize >= 1, 'Queue should have entries');
  console.log('  [PASS] Queue trace');
}

// -- Test: Hex ID generation --

function testHexId() {
  const id1 = exporter._toHexId('test-trace-1', 32);
  const id2 = exporter._toHexId('test-trace-2', 32);
  assert.strictEqual(id1.length, 32, 'Should be 32 chars');
  assert.strictEqual(id2.length, 32, 'Should be 32 chars');
  assert.notStrictEqual(id1, id2, 'Different inputs should produce different IDs');
  assert.ok(/^[0-9a-f]+$/.test(id1), 'Should be hex string');
  console.log('  [PASS] Hex ID generation');
}

// -- Test: Flush with no endpoint --

async function testFlushNoEndpoint() {
  const result = await exporter.flush();
  assert.strictEqual(result.exported, 0, 'Should export 0 with no endpoint');
  console.log('  [PASS] Flush with no endpoint configured');
}

// -- Test: Get recent OTLP --

function testGetRecentOTLP() {
  const otlpList = exporter.getRecentOTLP(5);
  assert.ok(Array.isArray(otlpList), 'Should return array');
  for (const otlp of otlpList) {
    assert.ok(otlp.resourceSpans, 'Each should have resourceSpans');
  }
  console.log('  [PASS] Get recent OTLP');
}

// -- Test: Stats --

function testStats() {
  const stats = exporter.getStats();
  assert.ok(typeof stats.exported === 'number');
  assert.ok(typeof stats.failed === 'number');
  assert.ok(typeof stats.queued === 'number');
  assert.ok(typeof stats.queueSize === 'number');
  console.log('  [PASS] Stats tracking');
}

// -- Run All --

async function run() {
  console.log('OTel Exporter Tests');
  console.log('===================');

  let passed = 0;
  let failed = 0;

  const tests = [
    testToOTLP,
    testQueueTrace,
    testHexId,
    testFlushNoEndpoint,
    testGetRecentOTLP,
    testStats,
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
