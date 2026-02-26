/**
 * Tests for graph-tools.js
 *
 * Verifies that createGraphTools returns the 4 expected tools
 * (graph_find_connections, graph_risk_propagation, graph_find_rings,
 * graph_community) each with name, description, and handler.
 * Also verifies handlers run without error (they may return empty data
 * if the graph is empty).
 */

import { createGraphTools } from '../graph-tools.js';

const EXPECTED_TOOLS = [
  'graph_find_connections',
  'graph_risk_propagation',
  'graph_find_rings',
  'graph_community',
  'graph_multi_hop_investigate',
];

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    passed++;
    console.log(`  PASS: ${message}`);
  } else {
    failed++;
    console.error(`  FAIL: ${message}`);
  }
}

async function runTests() {
  console.log('=== Graph Tools Tests ===\n');

  // -------------------------------------------------------------------
  // Test 1: createGraphTools returns an object with the 4 expected tools
  // -------------------------------------------------------------------
  console.log('Test 1: createGraphTools returns expected tool keys');
  const tools = createGraphTools();
  assert(typeof tools === 'object' && tools !== null, 'createGraphTools() returns an object');

  const toolNames = Object.keys(tools);
  assert(toolNames.length === 5, `Returns exactly 5 tools (got ${toolNames.length})`);

  for (const name of EXPECTED_TOOLS) {
    assert(toolNames.includes(name), `Contains tool "${name}"`);
  }

  // -------------------------------------------------------------------
  // Test 2: Each tool has name, description, and handler
  // -------------------------------------------------------------------
  console.log('\nTest 2: Each tool has name, description, and handler');
  for (const name of EXPECTED_TOOLS) {
    const tool = tools[name];
    assert(typeof tool === 'object' && tool !== null, `"${name}" is an object`);
    assert(typeof tool.name === 'string' && tool.name.length > 0, `"${name}" has a non-empty name`);
    assert(typeof tool.description === 'string' && tool.description.length > 0, `"${name}" has a non-empty description`);
    assert(typeof tool.handler === 'function', `"${name}" has a handler function`);
  }

  // -------------------------------------------------------------------
  // Test 3: Handlers run without error on empty graph
  // -------------------------------------------------------------------
  console.log('\nTest 3: Handlers run without error (empty graph)');

  const testSellerId = 'SELLER-TEST-001';

  // graph_find_connections
  const connResult = await tools.graph_find_connections.handler({ sellerId: testSellerId, depth: 2 });
  assert(typeof connResult === 'object', 'graph_find_connections returns an object');
  assert('success' in connResult, 'graph_find_connections result has "success" field');

  // graph_risk_propagation
  const riskResult = await tools.graph_risk_propagation.handler({ sellerId: testSellerId, depth: 2 });
  assert(typeof riskResult === 'object', 'graph_risk_propagation returns an object');
  assert('success' in riskResult, 'graph_risk_propagation result has "success" field');

  // graph_find_rings
  const ringsResult = await tools.graph_find_rings.handler({ sellerId: testSellerId, maxLength: 5 });
  assert(typeof ringsResult === 'object', 'graph_find_rings returns an object');
  assert('success' in ringsResult, 'graph_find_rings result has "success" field');

  // graph_community
  const communityResult = await tools.graph_community.handler({ sellerId: testSellerId });
  assert(typeof communityResult === 'object', 'graph_community returns an object');
  assert('success' in communityResult, 'graph_community result has "success" field');

  // -------------------------------------------------------------------
  // Summary
  // -------------------------------------------------------------------
  console.log(`\n=== Results: ${passed} passed, ${failed} failed ===`);
  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch(err => {
  console.error('Test runner error:', err);
  process.exit(1);
});
