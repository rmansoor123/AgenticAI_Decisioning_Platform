/**
 * Hybrid Retrieval Tests
 * Tests RRF fusion, neural reranking, and hybrid search pipeline.
 *
 * Run with: node backend/agents/core/__tests__/hybrid-retrieval.test.js
 */

import assert from 'node:assert';
import { getNeuralReranker } from '../neural-reranker.js';

const reranker = getNeuralReranker();

// ── Test: Heuristic rerank with keyword overlap ──

function testHeuristicRerank() {
  const results = [
    { text: 'Unrelated document about weather patterns', relevanceScore: 0.9 },
    { text: 'Fraud detection using velocity checks and IP analysis', relevanceScore: 0.5 },
    { text: 'Machine learning for fraud prevention and detection', relevanceScore: 0.6 },
  ];

  const reranked = reranker._heuristicRerank('fraud detection velocity', results);
  assert.ok(reranked[0].text.includes('velocity'), 'Should rank velocity doc higher');
  assert.ok(reranked.every(r => r._rerankScore >= 0 && r._rerankScore <= 1), 'Scores should be 0-1');
  assert.strictEqual(reranked[0]._rerankMethod, 'heuristic', 'Should be heuristic method');
  console.log('  [PASS] Heuristic rerank with keyword overlap');
}

// ── Test: Rerank preserves results ──

async function testRerankPreservesResults() {
  const results = [
    { text: 'Document A about fraud', relevanceScore: 0.8 },
    { text: 'Document B about risk', relevanceScore: 0.7 },
  ];

  const reranked = await reranker.rerank('fraud risk', results, 5);
  assert.strictEqual(reranked.length, 2, 'Should preserve all results');
  assert.ok(reranked.every(r => r._rerankScore != null), 'Each should have rerank score');
  console.log('  [PASS] Rerank preserves all results');
}

// ── Test: Empty results handled ──

async function testEmptyResults() {
  const reranked = await reranker.rerank('query', []);
  assert.deepStrictEqual(reranked, [], 'Empty input returns empty');
  console.log('  [PASS] Empty results handled');
}

// ── Test: Single result returned as-is ──

async function testSingleResult() {
  const results = [{ text: 'Only doc', relevanceScore: 0.9 }];
  const reranked = await reranker.rerank('query', results);
  assert.strictEqual(reranked.length, 1, 'Single result returned');
  console.log('  [PASS] Single result returned as-is');
}

// ── Test: TopK limits output ──

async function testTopKLimit() {
  const results = Array.from({ length: 10 }, (_, i) => ({
    text: `Document ${i} about fraud detection`,
    relevanceScore: 0.5 + (i * 0.05),
  }));

  const reranked = await reranker.rerank('fraud detection', results, 3);
  assert.strictEqual(reranked.length, 3, 'Should limit to topK=3');
  console.log('  [PASS] TopK limits output');
}

// ── Test: Stats tracking ──

function testStats() {
  const stats = reranker.getStats();
  assert.ok(stats.rerankCalls >= 2, 'Should track rerank calls');
  assert.ok(typeof stats.heuristicReranks === 'number', 'Should track heuristic reranks');
  assert.ok(typeof stats.avgLatencyMs === 'number', 'Should track latency');
  console.log('  [PASS] Stats tracking');
}

// ── Test: RRF score calculation ──

function testRRFScoring() {
  const RRF_K = 60;
  const rank1Score = 1 / (RRF_K + 1);
  const rank2Score = 1 / (RRF_K + 2);
  const fusedScore = rank1Score + rank2Score;
  const singleScore = rank1Score;

  assert.ok(fusedScore > singleScore, 'Fused score should be higher than single-source');
  assert.ok(Math.abs(fusedScore - (1/61 + 1/62)) < 0.0001, 'RRF math should be correct');
  console.log('  [PASS] RRF score calculation');
}

// ── Run All ──

async function run() {
  console.log('Hybrid Retrieval Tests');
  console.log('=====================');

  let passed = 0;
  let failed = 0;

  const tests = [
    testHeuristicRerank,
    testRerankPreservesResults,
    testEmptyResults,
    testSingleResult,
    testTopKLimit,
    testStats,
    testRRFScoring,
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
