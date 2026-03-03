/**
 * Reasoning Graph Tests
 * Tests graph traversal, conditional edges, loop protection, and default graph.
 *
 * Run with: node backend/agents/core/__tests__/reasoning-graph.test.js
 */

import assert from 'node:assert';
import { ReasoningGraph, buildDefaultGraph } from '../reasoning-graph.js';

// ── Test: Basic linear traversal ──

async function testLinearTraversal() {
  const graph = new ReasoningGraph();
  const visited = [];

  graph.addNode('A', async (ctx) => { visited.push('A'); return 'resultA'; });
  graph.addNode('B', async (ctx) => { visited.push('B'); return 'resultB'; });
  graph.addNode('C', async (ctx) => { visited.push('C'); return 'resultC'; });

  graph.addEdge('A', 'B');
  graph.addEdge('B', 'C');

  const result = await graph.execute('A', {});
  assert.deepStrictEqual(visited, ['A', 'B', 'C'], 'Should visit A → B → C');
  assert.strictEqual(result.A, 'resultA');
  assert.strictEqual(result.B, 'resultB');
  assert.strictEqual(result.C, 'resultC');
  assert.deepStrictEqual(result._visitedNodes, ['A', 'B', 'C']);
  console.log('  [PASS] Linear traversal');
}

// ── Test: Conditional edge routing ──

async function testConditionalEdges() {
  const graph = new ReasoningGraph();

  graph.addNode('start', async () => ({ score: 80 }));
  graph.addNode('high_path', async () => 'went high');
  graph.addNode('low_path', async () => 'went low');
  graph.addNode('end', async () => 'done');

  // High score goes to high_path
  graph.addEdge('start', 'high_path', (ctx) => ctx.start.score > 50, 10);
  // Low score goes to low_path
  graph.addEdge('start', 'low_path', (ctx) => ctx.start.score <= 50, 5);

  graph.addEdge('high_path', 'end');
  graph.addEdge('low_path', 'end');

  const result = await graph.execute('start', {});
  assert.ok(result._visitedNodes.includes('high_path'), 'Should take high path');
  assert.ok(!result._visitedNodes.includes('low_path'), 'Should not take low path');
  console.log('  [PASS] Conditional edge routing');
}

// ── Test: Unconditional edge as fallback ──

async function testUnconditionalFallback() {
  const graph = new ReasoningGraph();

  graph.addNode('start', async () => ({ value: 'normal' }));
  graph.addNode('special', async () => 'special');
  graph.addNode('default', async () => 'default');

  // Conditional edge that won't match
  graph.addEdge('start', 'special', (ctx) => ctx.start.value === 'rare', 10);
  // Unconditional fallback
  graph.addEdge('start', 'default');

  const result = await graph.execute('start', {});
  assert.ok(result._visitedNodes.includes('default'), 'Should fall through to default');
  assert.ok(!result._visitedNodes.includes('special'), 'Should not take special path');
  console.log('  [PASS] Unconditional edge as fallback');
}

// ── Test: Loop with exit condition ──

async function testLoopWithExit() {
  const graph = new ReasoningGraph();
  let counter = 0;

  graph.addNode('process', async (ctx) => {
    counter++;
    return { iteration: counter };
  });
  graph.addNode('done', async () => 'finished');

  // Loop back if under 3 iterations
  graph.addEdge('process', 'process', (ctx) => ctx.process.iteration < 3, 10);
  // Exit when done
  graph.addEdge('process', 'done', (ctx) => ctx.process.iteration >= 3, 5);

  const result = await graph.execute('process', {});
  assert.strictEqual(counter, 3, 'Should loop 3 times');
  assert.ok(result._visitedNodes.includes('done'), 'Should reach done node');
  console.log('  [PASS] Loop with exit condition');
}

// ── Test: Max visits safety (infinite loop protection) ──

async function testMaxVisitsSafety() {
  const graph = new ReasoningGraph();
  let counter = 0;

  graph.addNode('infinite', async () => { counter++; return counter; });
  // Always loop back (infinite)
  graph.addEdge('infinite', 'infinite');

  const result = await graph.execute('infinite', {});
  assert.ok(counter <= 20, `Should stop at max visits (${counter} iterations)`);
  console.log('  [PASS] Max visits safety prevents infinite loops');
}

// ── Test: Missing start node throws ──

async function testMissingStartNode() {
  const graph = new ReasoningGraph();
  try {
    await graph.execute('nonexistent', {});
    assert.fail('Should throw for missing start node');
  } catch (err) {
    assert.ok(err.message.includes('not found'), 'Error should mention node not found');
  }
  console.log('  [PASS] Missing start node throws');
}

// ── Test: Remove edges ──

function testRemoveEdges() {
  const graph = new ReasoningGraph();
  graph.addNode('A', async () => 'a');
  graph.addNode('B', async () => 'b');
  graph.addNode('C', async () => 'c');
  graph.addEdge('A', 'B');
  graph.addEdge('A', 'C');

  graph.removeEdgesFrom('A');
  const desc = graph.describe();
  assert.strictEqual(desc.edges.filter(e => e.from === 'A').length, 0, 'Should have no edges from A');
  console.log('  [PASS] Remove edges');
}

// ── Test: Graph describe ──

function testDescribe() {
  const graph = new ReasoningGraph();
  graph.addNode('X', async () => 'x');
  graph.addNode('Y', async () => 'y');
  graph.addEdge('X', 'Y', () => true);
  graph.addEdge('X', 'Y');

  const desc = graph.describe();
  assert.deepStrictEqual(desc.nodes, ['X', 'Y']);
  assert.strictEqual(desc.edges.length, 2);
  assert.strictEqual(desc.edges[0].conditional, true);
  assert.strictEqual(desc.edges[1].conditional, false);
  console.log('  [PASS] Graph describe');
}

// ── Test: Graph trace recorded in context ──

async function testGraphTrace() {
  const graph = new ReasoningGraph();
  graph.addNode('fast', async () => 'quick');
  graph.addNode('slow', async () => {
    await new Promise(r => setTimeout(r, 10));
    return 'done';
  });
  graph.addEdge('fast', 'slow');

  const result = await graph.execute('fast', {});
  assert.ok(result._graphTrace.length === 2, 'Should have 2 trace entries');
  assert.strictEqual(result._graphTrace[0].node, 'fast');
  assert.strictEqual(result._graphTrace[1].node, 'slow');
  assert.ok(result._graphTrace[0].durationMs >= 0, 'Should track duration');
  console.log('  [PASS] Graph trace recorded');
}

// ── Test: Priority ordering of conditional edges ──

async function testEdgePriority() {
  const graph = new ReasoningGraph();

  graph.addNode('start', async () => ({ value: 10 }));
  graph.addNode('high_priority', async () => 'high');
  graph.addNode('low_priority', async () => 'low');

  // Both conditions match, but high priority should win
  graph.addEdge('start', 'high_priority', (ctx) => ctx.start.value > 5, 10);
  graph.addEdge('start', 'low_priority', (ctx) => ctx.start.value > 5, 1);

  const result = await graph.execute('start', {});
  assert.ok(result._visitedNodes.includes('high_priority'), 'Should take high priority path');
  assert.ok(!result._visitedNodes.includes('low_priority'), 'Should not take low priority path');
  console.log('  [PASS] Edge priority ordering');
}

// ── Run All ──

async function run() {
  console.log('Reasoning Graph Tests');
  console.log('=====================');

  let passed = 0;
  let failed = 0;

  const tests = [
    testLinearTraversal,
    testConditionalEdges,
    testUnconditionalFallback,
    testLoopWithExit,
    testMaxVisitsSafety,
    testMissingStartNode,
    testRemoveEdges,
    testDescribe,
    testGraphTrace,
    testEdgePriority,
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
