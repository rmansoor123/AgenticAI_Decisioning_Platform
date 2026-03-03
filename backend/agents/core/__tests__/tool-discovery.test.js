/**
 * Tool Discovery Tests
 * Tests MCP-based runtime tool discovery, caching, and handler creation.
 *
 * Run with: node backend/agents/core/__tests__/tool-discovery.test.js
 */

import assert from 'node:assert';
import { getToolDiscovery } from '../tool-discovery.js';

const discovery = getToolDiscovery();

// ── Test: Initialization ──

function testInitialization() {
  assert.ok(discovery.mcpEndpoints.length >= 1, 'Should have at least one endpoint');
  assert.strictEqual(discovery.discoveredTools.size, 0, 'Should start with empty cache');
  console.log('  [PASS] Initialization');
}

// ── Test: Add endpoint ──

function testAddEndpoint() {
  discovery.addEndpoint('http://localhost:9999');
  assert.ok(discovery.mcpEndpoints.includes('http://localhost:9999'), 'Should add endpoint');

  // Adding same endpoint again should not duplicate
  const countBefore = discovery.mcpEndpoints.length;
  discovery.addEndpoint('http://localhost:9999');
  assert.strictEqual(discovery.mcpEndpoints.length, countBefore, 'Should not duplicate endpoints');
  console.log('  [PASS] Add endpoint (no duplicates)');
}

// ── Test: Discover tools returns empty for unavailable endpoint ──

async function testDiscoverToolsUnavailable() {
  const results = await discovery.discoverTools('nonexistent_tool_xyz');
  assert.ok(Array.isArray(results), 'Should return array');
  // May be empty if no MCP servers are running, that's fine
  console.log('  [PASS] Discover tools handles unavailable endpoints');
}

// ── Test: Null/empty capability ──

async function testNullCapability() {
  const result1 = await discovery.discoverTools(null);
  assert.deepStrictEqual(result1, [], 'Null capability returns empty');

  const result2 = await discovery.discoverTools('');
  assert.deepStrictEqual(result2, [], 'Empty capability returns empty');
  console.log('  [PASS] Null/empty capability handled');
}

// ── Test: Handler creation ──

function testHandlerCreation() {
  const handler = discovery._createHandler('http://localhost:3001', 'test_tool');
  assert.strictEqual(typeof handler, 'function', 'Should create a function');
  console.log('  [PASS] Handler creation');
}

// ── Test: Stats tracking ──

function testStats() {
  const stats = discovery.getStats();
  assert.ok(typeof stats.endpoints === 'number', 'Should track endpoint count');
  assert.ok(typeof stats.cachedTools === 'number', 'Should track cached tools');
  assert.ok(typeof stats.discoveries === 'number', 'Should track discoveries');
  assert.ok(typeof stats.cacheHits === 'number', 'Should track cache hits');
  assert.ok(typeof stats.failures === 'number', 'Should track failures');
  console.log('  [PASS] Stats tracking');
}

// ── Test: List all tools (graceful with no servers) ──

async function testListAllTools() {
  const tools = await discovery.listAllTools();
  assert.ok(Array.isArray(tools), 'Should return array');
  // If a local server happens to be running, we might get tools
  for (const tool of tools) {
    assert.ok(tool.name, 'Each tool should have a name');
    assert.ok(tool.endpoint, 'Each tool should have an endpoint');
  }
  console.log('  [PASS] List all tools');
}

// ── Run All ──

async function run() {
  console.log('Tool Discovery Tests');
  console.log('====================');

  let passed = 0;
  let failed = 0;

  const tests = [
    testInitialization,
    testAddEndpoint,
    testDiscoverToolsUnavailable,
    testNullCapability,
    testHandlerCreation,
    testStats,
    testListAllTools,
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
