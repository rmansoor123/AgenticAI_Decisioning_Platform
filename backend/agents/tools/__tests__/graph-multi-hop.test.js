/**
 * Tests for multi-hop graph investigation tool.
 *
 * Standalone Node.js test script — no test framework required.
 * Run: node backend/agents/tools/__tests__/graph-multi-hop.test.js
 */

import { getGraphEngine } from '../../../graph/graph-engine.js';
import { multiHopInvestigate } from '../../../graph/graph-queries.js';
import { createGraphTools } from '../graph-tools.js';

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

function resetGraph() {
  const engine = getGraphEngine();
  engine.nodes.clear();
  engine.edges.clear();
  engine.outEdges.clear();
  engine.inEdges.clear();
  for (const [, index] of engine.propertyIndexes) {
    index.clear();
  }
}

// ---------------------------------------------------------------------------
// Test 1: Tool exists in createGraphTools output
// ---------------------------------------------------------------------------
console.log('\nTest 1: graph_multi_hop_investigate tool exists');
{
  const tools = createGraphTools();
  assert(tools.graph_multi_hop_investigate !== undefined, 'tool is defined');
  assert(tools.graph_multi_hop_investigate.name === 'graph_multi_hop_investigate', 'tool has correct name');
  assert(typeof tools.graph_multi_hop_investigate.description === 'string' && tools.graph_multi_hop_investigate.description.length > 0, 'tool has a description');
  assert(typeof tools.graph_multi_hop_investigate.handler === 'function', 'tool has a handler function');
}

// ---------------------------------------------------------------------------
// Test 2: Handler returns proper structure on empty graph
// ---------------------------------------------------------------------------
console.log('\nTest 2: handler returns proper structure on empty graph');
{
  resetGraph();
  const tools = createGraphTools();
  const result = await tools.graph_multi_hop_investigate.handler({ sellerId: 'nonexistent' });
  assert(result.success === true || result.success === false, 'result has success field');
  assert(result.data !== undefined, 'result has data field');
  assert(Array.isArray(result.data.evidenceChain), 'data has evidenceChain array');
  assert(typeof result.data.totalRiskSignals === 'number', 'data has totalRiskSignals number');
}

// ---------------------------------------------------------------------------
// Test 3: multiHopInvestigate returns correct structure for empty graph
// ---------------------------------------------------------------------------
console.log('\nTest 3: multiHopInvestigate on empty graph');
{
  resetGraph();
  const result = multiHopInvestigate('nonexistent');
  assert(Array.isArray(result.evidenceChain), 'evidenceChain is an array');
  assert(result.evidenceChain.length === 0, 'evidenceChain is empty for nonexistent node');
  assert(result.totalRiskSignals === 0, 'totalRiskSignals is 0');
}

// ---------------------------------------------------------------------------
// Test 4: multiHopInvestigate traverses edges and collects risk signals
// ---------------------------------------------------------------------------
console.log('\nTest 4: multiHopInvestigate with populated graph');
{
  resetGraph();
  const engine = getGraphEngine();

  // Build a small graph: A -> B -> C -> D
  engine.addNode('A', 'seller', { riskScore: 30 });
  engine.addNode('B', 'seller', { riskScore: 75, fraudHistory: true });
  engine.addNode('C', 'seller', { riskScore: 20, watchlistMatch: true });
  engine.addNode('D', 'seller', { riskScore: 10, status: 'REJECTED' });

  engine.addEdge('A', 'B', 'LINKED', { weight: 0.9 });
  engine.addEdge('B', 'C', 'LINKED', { weight: 0.8 });
  engine.addEdge('C', 'D', 'LINKED', { weight: 0.75 });

  const result = multiHopInvestigate('A', 3, 0.7);

  assert(result.evidenceChain.length > 0, 'evidenceChain has entries');
  assert(result.totalRiskSignals > 0, 'found risk signals in network');

  // Check evidence chain entries have expected fields
  for (const entry of result.evidenceChain) {
    assert(typeof entry.entity === 'string', `entry has entity field: ${entry.entity}`);
    assert(typeof entry.hop === 'number', `entry has hop field: ${entry.hop}`);
    assert(typeof entry.relationship === 'string', `entry has relationship field: ${entry.relationship}`);
    assert(Array.isArray(entry.riskSignals), `entry has riskSignals array: ${JSON.stringify(entry.riskSignals)}`);
    assert(typeof entry.properties === 'object' && entry.properties !== null, 'entry has properties object');
  }

  // Node B should have 'high-risk-score' and 'fraud-history'
  const entryB = result.evidenceChain.find(e => e.entity === 'B');
  assert(entryB !== undefined, 'entry for node B exists');
  if (entryB) {
    assert(entryB.riskSignals.includes('high-risk-score'), 'B has high-risk-score signal');
    assert(entryB.riskSignals.includes('fraud-history'), 'B has fraud-history signal');
    assert(entryB.hop === 1, 'B is at hop 1');
  }

  // Node C should have 'watchlist-match'
  const entryC = result.evidenceChain.find(e => e.entity === 'C');
  assert(entryC !== undefined, 'entry for node C exists');
  if (entryC) {
    assert(entryC.riskSignals.includes('watchlist-match'), 'C has watchlist-match signal');
    assert(entryC.hop === 2, 'C is at hop 2');
  }

  // Node D should have 'rejected-entity'
  const entryD = result.evidenceChain.find(e => e.entity === 'D');
  assert(entryD !== undefined, 'entry for node D exists');
  if (entryD) {
    assert(entryD.riskSignals.includes('rejected-entity'), 'D has rejected-entity signal');
    assert(entryD.hop === 3, 'D is at hop 3');
  }
}

// ---------------------------------------------------------------------------
// Test 5: multiHopInvestigate respects minWeight filter
// ---------------------------------------------------------------------------
console.log('\nTest 5: multiHopInvestigate respects minWeight filter');
{
  resetGraph();
  const engine = getGraphEngine();

  engine.addNode('X', 'seller', { riskScore: 10 });
  engine.addNode('Y', 'seller', { riskScore: 80 });
  engine.addNode('Z', 'seller', { riskScore: 90 });

  engine.addEdge('X', 'Y', 'LINKED', { weight: 0.9 });
  engine.addEdge('Y', 'Z', 'LINKED', { weight: 0.3 }); // Below minWeight

  const result = multiHopInvestigate('X', 3, 0.7);

  // Should find Y (hop 1) but NOT Z (edge weight too low)
  const entryY = result.evidenceChain.find(e => e.entity === 'Y');
  const entryZ = result.evidenceChain.find(e => e.entity === 'Z');
  assert(entryY !== undefined, 'Y is reachable via high-weight edge');
  assert(entryZ === undefined, 'Z is NOT reachable (edge weight below threshold)');
}

// ---------------------------------------------------------------------------
// Test 6: multiHopInvestigate respects maxHops limit
// ---------------------------------------------------------------------------
console.log('\nTest 6: multiHopInvestigate respects maxHops limit');
{
  resetGraph();
  const engine = getGraphEngine();

  engine.addNode('H0', 'seller', { riskScore: 10 });
  engine.addNode('H1', 'seller', { riskScore: 60 });
  engine.addNode('H2', 'seller', { riskScore: 70 });
  engine.addNode('H3', 'seller', { riskScore: 80 });

  engine.addEdge('H0', 'H1', 'LINKED', { weight: 0.9 });
  engine.addEdge('H1', 'H2', 'LINKED', { weight: 0.9 });
  engine.addEdge('H2', 'H3', 'LINKED', { weight: 0.9 });

  const result = multiHopInvestigate('H0', 2, 0.7); // Only 2 hops

  const entryH1 = result.evidenceChain.find(e => e.entity === 'H1');
  const entryH2 = result.evidenceChain.find(e => e.entity === 'H2');
  const entryH3 = result.evidenceChain.find(e => e.entity === 'H3');

  assert(entryH1 !== undefined, 'H1 is reachable at hop 1');
  assert(entryH2 !== undefined, 'H2 is reachable at hop 2');
  assert(entryH3 === undefined, 'H3 is NOT reachable (beyond maxHops=2)');
}

// ---------------------------------------------------------------------------
// Test 7: Start node (hop 0) is skipped in evidence chain
// ---------------------------------------------------------------------------
console.log('\nTest 7: start node is skipped in evidence chain');
{
  resetGraph();
  const engine = getGraphEngine();

  engine.addNode('START', 'seller', { riskScore: 99, fraudHistory: true });
  engine.addNode('NEXT', 'seller', { riskScore: 60 });

  engine.addEdge('START', 'NEXT', 'LINKED', { weight: 0.9 });

  const result = multiHopInvestigate('START', 3, 0.7);

  const entryStart = result.evidenceChain.find(e => e.entity === 'START');
  assert(entryStart === undefined, 'start node is not included in evidence chain');
}

// ---------------------------------------------------------------------------
// Test 8: Handler error case returns graceful fallback
// ---------------------------------------------------------------------------
console.log('\nTest 8: handler error returns graceful fallback');
{
  resetGraph();
  const tools = createGraphTools();
  // Pass an invalid sellerId to a graph with nodes to ensure the function runs cleanly
  const result = await tools.graph_multi_hop_investigate.handler({ sellerId: 'does-not-exist', maxHops: 3, minWeight: 0.7 });
  assert(result.data !== undefined, 'error result has data');
  assert(Array.isArray(result.data.evidenceChain), 'error result has evidenceChain array');
  assert(typeof result.data.totalRiskSignals === 'number', 'error result has totalRiskSignals');
}

// ---------------------------------------------------------------------------
// Summary
// ---------------------------------------------------------------------------
console.log(`\n========================================`);
console.log(`Results: ${passed} passed, ${failed} failed, ${passed + failed} total`);
console.log(`========================================\n`);

if (failed > 0) {
  process.exit(1);
}
