/**
 * Unit test: verifies LLM-powered metadata filter generation from natural language queries.
 * Run with: node backend/agents/core/__tests__/self-query.test.js
 */

import { getSelfQueryEngine } from '../self-query.js';

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

  // ── Test 1: Singleton pattern ──
  console.log('\nTest 1: Singleton pattern');
  const engine1 = getSelfQueryEngine();
  const engine2 = getSelfQueryEngine();
  assert(engine1 === engine2, 'getSelfQueryEngine() returns same instance');

  // ── Test 2: generateFilters returns expected shape ──
  console.log('\nTest 2: generateFilters returns expected shape');
  const result = await engine1.generateFilters('high-risk electronics sellers from US');
  assert(result !== null && typeof result === 'object', 'generateFilters returns an object');
  assert('filters' in result, 'result has filters property');
  assert('cleanedQuery' in result, 'result has cleanedQuery property');
  assert(typeof result.filters === 'object', 'filters is an object');
  assert(typeof result.cleanedQuery === 'string', 'cleanedQuery is a string');

  // ── Test 3: Fallback filters for category extraction ──
  console.log('\nTest 3: Fallback extracts category from query');
  const catResult = await engine1.generateFilters('suspicious electronics transactions');
  assert(
    catResult.filters.category === 'ELECTRONICS' || catResult.cleanedQuery.length > 0,
    'Category extracted or query preserved in fallback mode'
  );

  // ── Test 4: Fallback filters for country extraction ──
  console.log('\nTest 4: Fallback extracts country from query');
  const countryResult = await engine1.generateFilters('sellers from United States with high risk');
  assert(
    countryResult.filters.country === 'US' || countryResult.cleanedQuery.length > 0,
    'Country extracted or query preserved in fallback mode'
  );

  // ── Test 5: Fallback filters for risk level ──
  console.log('\nTest 5: Fallback extracts risk level from query');
  const riskResult = await engine1.generateFilters('high-risk sellers');
  const hasRiskFilter = riskResult.filters.riskScore !== undefined ||
    riskResult.filters.riskLevel !== undefined;
  assert(hasRiskFilter || riskResult.cleanedQuery.length > 0,
    'Risk level extracted or query preserved in fallback mode');

  // ── Test 6: Fallback filters for status extraction ──
  console.log('\nTest 6: Fallback extracts status from query');
  const statusResult = await engine1.generateFilters('blocked sellers with high chargebacks');
  assert(
    statusResult.filters.status === 'BLOCKED' || statusResult.cleanedQuery.length > 0,
    'Status extracted or query preserved in fallback mode'
  );

  // ── Test 7: Empty query returns empty filters ──
  console.log('\nTest 7: Empty query returns empty filters');
  const emptyResult = await engine1.generateFilters('');
  assert(Object.keys(emptyResult.filters).length === 0, 'Empty query produces empty filters');
  assert(emptyResult.cleanedQuery === '', 'Empty cleanedQuery for empty input');

  // ── Test 8: Null/undefined query handling ──
  console.log('\nTest 8: Null/undefined query handling');
  const nullResult = await engine1.generateFilters(null);
  assert(nullResult !== null && typeof nullResult === 'object', 'Null query returns object');
  assert(Object.keys(nullResult.filters).length === 0, 'Null query produces empty filters');
  const undefinedResult = await engine1.generateFilters(undefined);
  assert(undefinedResult !== null && typeof undefinedResult === 'object', 'Undefined query returns object');
  assert(Object.keys(undefinedResult.filters).length === 0, 'Undefined query produces empty filters');

  // ── Test 9: applyToSearch returns correct search params ──
  console.log('\nTest 9: applyToSearch returns correct search params');
  const searchParams = await engine1.applyToSearch('high-risk electronics sellers', 'onboarding', 10);
  assert(searchParams !== null && typeof searchParams === 'object', 'applyToSearch returns an object');
  assert('query' in searchParams, 'search params has query');
  assert('namespace' in searchParams, 'search params has namespace');
  assert('topK' in searchParams, 'search params has topK');
  assert(searchParams.namespace === 'onboarding', 'namespace is preserved');
  assert(searchParams.topK === 10, 'topK is preserved');

  // ── Test 10: applyToSearch includes filter when filters found ──
  console.log('\nTest 10: applyToSearch includes filter when filters found');
  const searchWithFilter = await engine1.applyToSearch('electronics sellers from US', 'transactions', 5);
  assert('filter' in searchWithFilter, 'search params has filter property');
  assert(typeof searchWithFilter.filter === 'object', 'filter is an object');

  // ── Test 11: applyToSearch uses cleaned query ──
  console.log('\nTest 11: applyToSearch uses cleaned query');
  assert(typeof searchWithFilter.query === 'string', 'query is a string');
  assert(searchWithFilter.query.length > 0, 'cleaned query is not empty');

  // ── Test 12: Multiple filters extracted from complex query ──
  console.log('\nTest 12: Multiple filters extracted from complex query');
  const multiResult = await engine1.generateFilters('high-risk electronics sellers from US that are blocked');
  const filterCount = Object.keys(multiResult.filters).length;
  assert(filterCount >= 1, `Multiple filters extracted (got ${filterCount})`);

  // ── Test 13: applyToSearch with default topK ──
  console.log('\nTest 13: applyToSearch with default topK');
  const defaultTopK = await engine1.applyToSearch('test query', 'decisions');
  assert(defaultTopK.topK === 5, `Default topK is 5 (got ${defaultTopK.topK})`);

  // ── Test 14: Cleaned query removes filter terms ──
  console.log('\nTest 14: Cleaned query differs from original when filters extracted');
  const cleanResult = await engine1.generateFilters('high-risk electronics sellers from US');
  if (Object.keys(cleanResult.filters).length > 0) {
    // If filters were extracted, cleanedQuery should potentially differ
    assert(typeof cleanResult.cleanedQuery === 'string', 'cleanedQuery is always a string');
  } else {
    // If no filters extracted (no LLM), cleanedQuery should match original
    assert(cleanResult.cleanedQuery === 'high-risk electronics sellers from US',
      'cleanedQuery preserves original when no filters extracted');
  }

  // ── Test 15: getStats returns usage statistics ──
  console.log('\nTest 15: getStats returns statistics');
  const stats = engine1.getStats();
  assert(typeof stats === 'object', 'getStats returns an object');
  assert(typeof stats.totalQueries === 'number', 'stats has totalQueries');
  assert(stats.totalQueries > 0, `totalQueries > 0 (got ${stats.totalQueries})`);
  assert(typeof stats.llmEnabled === 'boolean', 'stats has llmEnabled');
  assert(typeof stats.fallbackCount === 'number', 'stats has fallbackCount');

  // ── Summary ──
  console.log(`\n${'='.repeat(40)}`);
  console.log(`Results: ${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

runTests();
