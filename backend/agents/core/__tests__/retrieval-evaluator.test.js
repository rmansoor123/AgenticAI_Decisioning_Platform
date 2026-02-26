/**
 * Unit test: verifies retrieval quality metrics — hit rate, MRR, and NDCG.
 * Run with: node backend/agents/core/__tests__/retrieval-evaluator.test.js
 */

import { getRetrievalEvaluator } from '../retrieval-evaluator.js';

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

  function assertApprox(actual, expected, tolerance, message) {
    const diff = Math.abs(actual - expected);
    if (diff <= tolerance) {
      console.log(`  PASS: ${message} (got ${actual}, expected ${expected})`);
      passed++;
    } else {
      console.error(`  FAIL: ${message} (got ${actual}, expected ${expected}, diff ${diff})`);
      failed++;
    }
  }

  // ── Test 1: Singleton pattern ──
  console.log('\nTest 1: Singleton pattern');
  const evaluator1 = getRetrievalEvaluator();
  const evaluator2 = getRetrievalEvaluator();
  assert(evaluator1 === evaluator2, 'getRetrievalEvaluator() returns same instance');

  // ── Test 2: Hit rate — perfect retrieval ──
  console.log('\nTest 2: Hit rate — perfect retrieval');
  const hr1 = evaluator1.computeHitRate(['a', 'b', 'c'], ['a', 'b', 'c']);
  assertApprox(hr1, 1.0, 0.001, 'Hit rate is 1.0 when all relevant docs retrieved');

  // ── Test 3: Hit rate — partial retrieval ──
  console.log('\nTest 3: Hit rate — partial retrieval');
  const hr2 = evaluator1.computeHitRate(['a', 'b', 'x'], ['a', 'b', 'c', 'd']);
  assertApprox(hr2, 0.5, 0.001, 'Hit rate is 0.5 when 2 of 4 relevant docs retrieved');

  // ── Test 4: Hit rate — no overlap ──
  console.log('\nTest 4: Hit rate — no overlap');
  const hr3 = evaluator1.computeHitRate(['x', 'y', 'z'], ['a', 'b', 'c']);
  assertApprox(hr3, 0.0, 0.001, 'Hit rate is 0.0 when no relevant docs retrieved');

  // ── Test 5: Hit rate — empty relevant set ──
  console.log('\nTest 5: Hit rate — empty relevant set');
  const hr4 = evaluator1.computeHitRate(['a', 'b'], []);
  assertApprox(hr4, 0.0, 0.001, 'Hit rate is 0.0 when relevant set is empty');

  // ── Test 6: MRR — first doc is relevant ──
  console.log('\nTest 6: MRR — first doc is relevant');
  const mrr1 = evaluator1.computeMRR(['a', 'b', 'c'], ['a']);
  assertApprox(mrr1, 1.0, 0.001, 'MRR is 1.0 when first retrieved doc is relevant');

  // ── Test 7: MRR — second doc is relevant ──
  console.log('\nTest 7: MRR — second doc is relevant');
  const mrr2 = evaluator1.computeMRR(['x', 'a', 'c'], ['a']);
  assertApprox(mrr2, 0.5, 0.001, 'MRR is 0.5 when first relevant doc is at position 2');

  // ── Test 8: MRR — third doc is relevant ──
  console.log('\nTest 8: MRR — third doc is relevant');
  const mrr3 = evaluator1.computeMRR(['x', 'y', 'a'], ['a']);
  assertApprox(mrr3, 1 / 3, 0.001, 'MRR is 1/3 when first relevant doc is at position 3');

  // ── Test 9: MRR — no relevant docs found ──
  console.log('\nTest 9: MRR — no relevant docs found');
  const mrr4 = evaluator1.computeMRR(['x', 'y', 'z'], ['a', 'b']);
  assertApprox(mrr4, 0.0, 0.001, 'MRR is 0.0 when no relevant docs in retrieved set');

  // ── Test 10: MRR — empty retrieved set ──
  console.log('\nTest 10: MRR — empty retrieved set');
  const mrr5 = evaluator1.computeMRR([], ['a']);
  assertApprox(mrr5, 0.0, 0.001, 'MRR is 0.0 when retrieved set is empty');

  // ── Test 11: NDCG — perfect ordering at k=3 ──
  console.log('\nTest 11: NDCG — perfect ordering at k=3');
  const ndcg1 = evaluator1.computeNDCG(['a', 'b', 'c'], ['a', 'b', 'c'], 3);
  assertApprox(ndcg1, 1.0, 0.001, 'NDCG@3 is 1.0 when top-3 retrieved matches all relevant');

  // ── Test 12: NDCG — no relevant docs ──
  console.log('\nTest 12: NDCG — no relevant docs');
  const ndcg2 = evaluator1.computeNDCG(['x', 'y', 'z'], ['a', 'b', 'c'], 3);
  assertApprox(ndcg2, 0.0, 0.001, 'NDCG@3 is 0.0 when no relevant docs in top-3');

  // ── Test 13: NDCG — relevant doc at position 2 only ──
  console.log('\nTest 13: NDCG — relevant doc at position 2 only');
  // Retrieved: [x, a, y], Relevant: [a]
  // DCG = 0 + 1/log2(3) + 0 = 1/1.585 = 0.6309
  // Ideal: [a, ...], IDCG = 1/log2(2) = 1.0
  // NDCG = 0.6309 / 1.0 = 0.6309
  const ndcg3 = evaluator1.computeNDCG(['x', 'a', 'y'], ['a'], 3);
  assertApprox(ndcg3, 1 / Math.log2(3), 0.001, 'NDCG@3 correct when single relevant doc at position 2');

  // ── Test 14: NDCG — k larger than retrieved set ──
  console.log('\nTest 14: NDCG — k larger than retrieved set');
  const ndcg4 = evaluator1.computeNDCG(['a'], ['a', 'b'], 5);
  // DCG = 1/log2(2) = 1.0
  // IDCG = 1/log2(2) + 1/log2(3) = 1.0 + 0.6309 = 1.6309
  // NDCG = 1.0 / 1.6309 = 0.6131
  assertApprox(ndcg4, 1.0 / (1.0 + 1 / Math.log2(3)), 0.001, 'NDCG handles k > retrieved set size');

  // ── Test 15: NDCG — empty sets ──
  console.log('\nTest 15: NDCG — empty sets');
  const ndcg5 = evaluator1.computeNDCG([], ['a'], 5);
  assertApprox(ndcg5, 0.0, 0.001, 'NDCG is 0.0 when retrieved set is empty');
  const ndcg6 = evaluator1.computeNDCG(['a'], [], 5);
  assertApprox(ndcg6, 0.0, 0.001, 'NDCG is 0.0 when relevant set is empty');

  // ── Test 16: NDCG — default k=5 ──
  console.log('\nTest 16: NDCG — default k=5');
  const ndcg7 = evaluator1.computeNDCG(['a', 'b', 'c', 'd', 'e'], ['a', 'b', 'c', 'd', 'e']);
  assertApprox(ndcg7, 1.0, 0.001, 'NDCG@5 is 1.0 with default k when all 5 relevant');

  // ── Test 17: evaluateRetrieval returns correct shape ──
  console.log('\nTest 17: evaluateRetrieval returns correct shape');
  const evalResult = evaluator1.evaluateRetrieval(['a', 'b', 'c'], ['a', 'c', 'd'], 'test query');
  assert(typeof evalResult === 'object', 'evaluateRetrieval returns an object');
  assert(evalResult.query === 'test query', 'result contains query');
  assert(typeof evalResult.hitRate === 'number', 'result contains hitRate');
  assert(typeof evalResult.mrr === 'number', 'result contains mrr');
  assert(typeof evalResult.ndcg === 'number', 'result contains ndcg');
  assert(typeof evalResult.retrievedCount === 'number', 'result contains retrievedCount');
  assert(typeof evalResult.relevantCount === 'number', 'result contains relevantCount');
  assert(typeof evalResult.timestamp === 'string', 'result contains timestamp');

  // ── Test 18: evaluateRetrieval computes correct values ──
  console.log('\nTest 18: evaluateRetrieval computes correct values');
  assert(evalResult.retrievedCount === 3, 'retrievedCount is 3');
  assert(evalResult.relevantCount === 3, 'relevantCount is 3');
  // Hit rate: 2 of 3 relevant found = 2/3
  assertApprox(evalResult.hitRate, 2 / 3, 0.001, 'hitRate matches expected value');
  // MRR: first relevant doc 'a' is at position 1 = 1/1 = 1.0
  assertApprox(evalResult.mrr, 1.0, 0.001, 'mrr matches expected value');

  // ── Test 19: MRR with multiple relevant — uses first found ──
  console.log('\nTest 19: MRR with multiple relevant — uses first found');
  const mrr6 = evaluator1.computeMRR(['x', 'b', 'a'], ['a', 'b']);
  assertApprox(mrr6, 0.5, 0.001, 'MRR uses rank of first relevant doc found (b at pos 2)');

  // ── Test 20: Hit rate with duplicate IDs in retrieved ──
  console.log('\nTest 20: Hit rate with duplicate IDs in retrieved');
  const hr5 = evaluator1.computeHitRate(['a', 'a', 'b'], ['a', 'b', 'c']);
  assertApprox(hr5, 2 / 3, 0.001, 'Hit rate counts unique matches (2 of 3)');

  // ── Summary ──
  console.log(`\n${'='.repeat(40)}`);
  console.log(`Results: ${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

runTests();
