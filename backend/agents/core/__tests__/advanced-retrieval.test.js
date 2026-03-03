/**
 * Advanced Retrieval Pipeline Tests
 * Tests self-query wiring, parent document retrieval, and multi-query decomposition.
 *
 * Run with: node backend/agents/core/__tests__/advanced-retrieval.test.js
 */

import assert from 'node:assert';

// ── Self-Query Engine Tests ──

async function testSelfQueryEngine() {
  const { getSelfQueryEngine } = await import('../self-query.js');
  const engine = getSelfQueryEngine();

  // Test basic filter generation (regex fallback)
  const result1 = await engine.generateFilters('high-risk electronics sellers from US');
  assert.ok(result1.filters, 'Should return filters object');
  assert.strictEqual(result1.filters.category, 'ELECTRONICS', 'Should extract ELECTRONICS category');
  assert.strictEqual(result1.filters.country, 'US', 'Should extract US country');
  assert.ok(result1.filters.riskLevel === 'HIGH', 'Should extract HIGH risk level');

  // Test empty query
  const result2 = await engine.generateFilters('');
  assert.deepStrictEqual(result2.filters, {}, 'Empty query should return empty filters');

  // Test applyToSearch
  const searchParams = await engine.applyToSearch('blocked sellers with chargebacks', 'onboarding');
  assert.strictEqual(searchParams.namespace, 'onboarding', 'Should preserve namespace');
  assert.ok(searchParams.query, 'Should have a query');
  assert.ok(searchParams.topK > 0, 'Should have topK');

  // Test no filters for vague queries
  const result3 = await engine.generateFilters('tell me about trends');
  // This might or might not extract filters, but shouldn't crash
  assert.ok(result3.cleanedQuery, 'Should return a cleaned query');

  // Test stats
  const stats = engine.getStats();
  assert.ok(stats.totalQueries >= 3, 'Should track query count');

  console.log('  [PASS] Self-query engine tests');
}

// ── Query Decomposer Tests ──

async function testQueryDecomposer() {
  const { getQueryDecomposer } = await import('../query-decomposer.js');
  const decomposer = getQueryDecomposer();

  // Short queries shouldn't be decomposed
  const result1 = await decomposer.decompose('check seller risk');
  assert.ok(Array.isArray(result1), 'Should return an array');
  assert.strictEqual(result1.length, 1, 'Short query should return single element');
  assert.strictEqual(result1[0], 'check seller risk', 'Short query should be unchanged');

  // Empty query
  const result2 = await decomposer.decompose('');
  assert.ok(Array.isArray(result2), 'Empty query should return array');
  assert.strictEqual(result2.length, 1, 'Empty query should return single element');

  // Null query
  const result3 = await decomposer.decompose(null);
  assert.ok(Array.isArray(result3), 'Null query should return array');

  // Complex query (without LLM, should fall back to single query)
  const result4 = await decomposer.decompose(
    'What are the risk patterns for high-value electronics sellers from China with chargeback history and account age under 30 days?'
  );
  assert.ok(Array.isArray(result4), 'Complex query should return array');
  assert.ok(result4.length >= 1, 'Should return at least 1 sub-query');
  assert.ok(result4.length <= 3, 'Should return at most 3 sub-queries');

  // Stats
  const stats = decomposer.getStats();
  assert.ok(stats.totalQueries >= 2, 'Should track queries');

  console.log('  [PASS] Query decomposer tests');
}

// ── Context Engine Integration Tests ──

async function testContextEngineIntegration() {
  const { getContextEngine } = await import('../context-engine.js');
  const engine = getContextEngine();

  // Test that assembleContext works with the new pipeline
  const result = await engine.assembleContext('TEST_AGENT', {
    type: 'seller_evaluation',
    sellerId: 'S-TEST-001',
    domain: 'onboarding'
  }, {
    sessionId: 'TEST-SESSION',
    systemPrompt: 'You are a test agent.',
    domain: 'onboarding',
    sellerId: 'S-TEST-001'
  });

  assert.ok(result.prompt, 'Should produce a prompt');
  assert.ok(result.sources, 'Should include source metadata');
  assert.ok(result.tokenCount > 0, 'Should count tokens');

  // Check that ragResults metadata includes new pipeline info when available
  if (result.sources.ragResults) {
    assert.ok('subQueryCount' in result.sources.ragResults || 'results' in result.sources.ragResults,
      'RAG metadata should include pipeline info');
  }

  console.log('  [PASS] Context engine integration tests');
}

// ── Run All ──

async function run() {
  console.log('Advanced Retrieval Pipeline Tests');
  console.log('=================================');

  let passed = 0;
  let failed = 0;

  const tests = [
    testSelfQueryEngine,
    testQueryDecomposer,
    testContextEngineIntegration,
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
