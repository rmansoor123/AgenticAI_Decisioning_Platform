/**
 * Unit test: verifies global context reranking with TF-IDF scoring and token allocation.
 * Run with: node backend/agents/core/__tests__/context-ranker.test.js
 */

import { getContextRanker } from '../context-ranker.js';

function runTests() {
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
  const ranker1 = getContextRanker();
  const ranker2 = getContextRanker();
  assert(ranker1 === ranker2, 'getContextRanker() returns same instance');

  // ── Test 2: rankItems returns items sorted by relevanceScore descending ──
  console.log('\nTest 2: rankItems sorts by relevanceScore descending');
  const items = [
    { source: 'ragResults', text: 'The seller account was flagged for suspicious activity patterns', tokens: 50 },
    { source: 'longTermMemory', text: 'Previous transaction had normal risk scores', tokens: 40 },
    { source: 'shortTermMemory', text: 'Seller flagged for suspicious fraud patterns in recent review', tokens: 60 }
  ];
  const ranked = ranker1.rankItems(items, 'suspicious fraud patterns');
  assert(Array.isArray(ranked), 'rankItems returns an array');
  assert(ranked.length === 3, 'rankItems returns all items');
  assert(typeof ranked[0].relevanceScore === 'number', 'Each item has a relevanceScore');
  // The item mentioning "suspicious fraud patterns" most should rank highest
  assert(ranked[0].relevanceScore >= ranked[1].relevanceScore, 'Items sorted by relevanceScore desc (0 >= 1)');
  assert(ranked[1].relevanceScore >= ranked[2].relevanceScore, 'Items sorted by relevanceScore desc (1 >= 2)');

  // ── Test 3: rankItems with exact keyword matches scores higher ──
  console.log('\nTest 3: rankItems — exact keyword matches score higher');
  const items2 = [
    { source: 'a', text: 'This text is about cats and dogs', tokens: 30 },
    { source: 'b', text: 'Fraud detection system identified anomalous transaction', tokens: 30 },
    { source: 'c', text: 'Anomalous fraud in transaction processing detected', tokens: 30 }
  ];
  const ranked2 = ranker1.rankItems(items2, 'fraud transaction anomalous');
  // Items b and c should rank above item a since they match query terms
  assert(ranked2[0].source !== 'a', 'Item without query terms does not rank first');
  assert(ranked2[2].source === 'a', 'Item without query terms ranks last');

  // ── Test 4: rankItems with empty query returns items with zero scores ──
  console.log('\nTest 4: rankItems — empty query returns items with zero or baseline scores');
  const ranked3 = ranker1.rankItems(items, '');
  assert(ranked3.length === 3, 'All items returned even with empty query');

  // ── Test 5: rankItems with empty items array ──
  console.log('\nTest 5: rankItems — empty items array');
  const ranked4 = ranker1.rankItems([], 'fraud');
  assert(ranked4.length === 0, 'Empty items returns empty array');

  // ── Test 6: allocateBudget — basic greedy allocation ──
  console.log('\nTest 6: allocateBudget — basic greedy allocation');
  const budgetItems = [
    { source: 'ragResults', text: 'High relevance', tokens: 100, relevanceScore: 0.9 },
    { source: 'shortTermMemory', text: 'Medium relevance', tokens: 100, relevanceScore: 0.5 },
    { source: 'longTermMemory', text: 'Low relevance', tokens: 100, relevanceScore: 0.2 }
  ];
  const result = ranker1.allocateBudget(budgetItems, 250);
  assert(typeof result === 'object', 'allocateBudget returns an object');
  assert(Array.isArray(result.items), 'result has items array');
  assert(Array.isArray(result.droppedItems), 'result has droppedItems array');
  assert(typeof result.totalTokens === 'number', 'result has totalTokens');
  assert(typeof result.remainingBudget === 'number', 'result has remainingBudget');
  // Budget of 250 can fit 2 items of 100 tokens each
  assert(result.items.length === 2, `Allocated 2 items within budget (got ${result.items.length})`);
  assert(result.droppedItems.length === 1, `Dropped 1 item over budget (got ${result.droppedItems.length})`);
  assert(result.totalTokens === 200, `Total tokens is 200 (got ${result.totalTokens})`);
  assert(result.remainingBudget === 50, `Remaining budget is 50 (got ${result.remainingBudget})`);
  // Highest relevance items should be allocated first
  assert(result.items[0].relevanceScore === 0.9, 'Highest relevance item allocated first');
  assert(result.items[1].relevanceScore === 0.5, 'Second highest relevance item allocated second');
  assert(result.droppedItems[0].relevanceScore === 0.2, 'Lowest relevance item dropped');

  // ── Test 7: allocateBudget — default budget of 4000 ──
  console.log('\nTest 7: allocateBudget — default budget of 4000');
  const smallItems = [
    { source: 'a', text: 'Item A', tokens: 50, relevanceScore: 0.8 },
    { source: 'b', text: 'Item B', tokens: 50, relevanceScore: 0.6 }
  ];
  const result2 = ranker1.allocateBudget(smallItems);
  assert(result2.items.length === 2, 'All items fit in default 4000 budget');
  assert(result2.totalTokens === 100, 'Total tokens is 100');
  assert(result2.remainingBudget === 3900, 'Remaining budget is 3900');

  // ── Test 8: allocateBudget — guarantees for system and task ──
  console.log('\nTest 8: allocateBudget — guarantees reserve tokens');
  const guaranteeItems = [
    { source: 'ragResults', text: 'RAG content', tokens: 400, relevanceScore: 0.9 },
    { source: 'longTermMemory', text: 'LTM content', tokens: 300, relevanceScore: 0.3 }
  ];
  const guarantees = { system: 200, task: 300 };
  const result3 = ranker1.allocateBudget(guaranteeItems, 800, guarantees);
  assert(typeof result3.guaranteedTokens === 'number', 'result has guaranteedTokens');
  assert(result3.guaranteedTokens === 500, `Guaranteed tokens is 500 (got ${result3.guaranteedTokens})`);
  // Effective budget for non-guaranteed items: 800 - 500 = 300
  // Only ragResults (400 tokens) should be too big, longTermMemory (300 tokens) fits
  // Actually ragResults has higher relevance, but 400 > 300 available, skip it
  // longTermMemory is 300 tokens, fits in remaining 300
  assert(result3.items.length === 1, `1 item allocated after guarantees (got ${result3.items.length})`);
  assert(result3.items[0].source === 'longTermMemory', 'LTM fits in remaining budget after guarantees');
  assert(result3.droppedItems.length === 1, 'RAG dropped because it exceeds remaining budget');

  // ── Test 9: allocateBudget — empty items ──
  console.log('\nTest 9: allocateBudget — empty items');
  const result4 = ranker1.allocateBudget([], 4000);
  assert(result4.items.length === 0, 'No items allocated');
  assert(result4.droppedItems.length === 0, 'No items dropped');
  assert(result4.totalTokens === 0, 'Total tokens is 0');
  assert(result4.remainingBudget === 4000, 'Full budget remains');

  // ── Test 10: allocateBudget — zero budget drops everything ──
  console.log('\nTest 10: allocateBudget — zero budget drops everything');
  const result5 = ranker1.allocateBudget(budgetItems, 0);
  assert(result5.items.length === 0, 'No items allocated with zero budget');
  assert(result5.droppedItems.length === 3, 'All items dropped');

  // ── Test 11: rankItems preserves source and tokens fields ──
  console.log('\nTest 11: rankItems preserves source and tokens fields');
  const ranked5 = ranker1.rankItems(
    [{ source: 'ragResults', text: 'test content', tokens: 42 }],
    'test'
  );
  assert(ranked5[0].source === 'ragResults', 'source field preserved');
  assert(ranked5[0].tokens === 42, 'tokens field preserved');
  assert(ranked5[0].text === 'test content', 'text field preserved');

  // ── Test 12: TF-IDF scoring — stopwords are ignored ──
  console.log('\nTest 12: TF-IDF scoring — common words have less impact');
  const items3 = [
    { source: 'a', text: 'the fraud detection system is running', tokens: 30 },
    { source: 'b', text: 'fraud fraud fraud detection detection', tokens: 30 }
  ];
  const ranked6 = ranker1.rankItems(items3, 'fraud detection');
  // Item b has higher term frequency for query terms, should rank higher
  assert(ranked6[0].source === 'b', 'Higher term frequency item ranks first');

  // ── Test 13: allocateBudget — large single item exceeding budget is skipped ──
  console.log('\nTest 13: allocateBudget — oversized item skipped, smaller items still allocated');
  const mixedItems = [
    { source: 'a', text: 'Large item', tokens: 5000, relevanceScore: 0.95 },
    { source: 'b', text: 'Small item', tokens: 100, relevanceScore: 0.5 }
  ];
  const result6 = ranker1.allocateBudget(mixedItems, 4000);
  assert(result6.items.length === 1, 'Only small item allocated');
  assert(result6.items[0].source === 'b', 'Small item is the one allocated');
  assert(result6.droppedItems.length === 1, 'Large item dropped');
  assert(result6.droppedItems[0].source === 'a', 'Dropped item is the large one');

  // ── Test 14: End-to-end: rankItems then allocateBudget ──
  console.log('\nTest 14: End-to-end — rank then allocate');
  const e2eItems = [
    { source: 'ragResults', text: 'Fraud transaction detected with high risk score anomalies', tokens: 200 },
    { source: 'shortTermMemory', text: 'Normal seller onboarding completed yesterday', tokens: 150 },
    { source: 'longTermMemory', text: 'Fraud pattern matching indicates high risk for this seller', tokens: 180 },
    { source: 'domainContext', text: 'Seller profile information and account details', tokens: 120 }
  ];
  const rankedE2E = ranker1.rankItems(e2eItems, 'fraud risk pattern');
  const allocatedE2E = ranker1.allocateBudget(rankedE2E, 400);
  assert(allocatedE2E.totalTokens <= 400, `Total tokens within budget (got ${allocatedE2E.totalTokens})`);
  assert(allocatedE2E.items.length > 0, 'At least one item allocated');
  // The most relevant items should be kept
  const allocatedSources = allocatedE2E.items.map(i => i.source);
  assert(
    !allocatedSources.includes('shortTermMemory') || allocatedSources.includes('ragResults') || allocatedSources.includes('longTermMemory'),
    'Relevant items prioritized over irrelevant ones'
  );

  // ── Test 15: allocateBudget — guarantees with zero remaining budget ──
  console.log('\nTest 15: allocateBudget — guarantees consuming entire budget');
  const result7 = ranker1.allocateBudget(
    [{ source: 'a', text: 'Item', tokens: 50, relevanceScore: 0.9 }],
    500,
    { system: 200, task: 300 }
  );
  assert(result7.guaranteedTokens === 500, 'Guarantees use full budget');
  assert(result7.items.length === 0, 'No items allocated when guarantees consume budget');
  assert(result7.droppedItems.length === 1, 'Item dropped when no budget left');

  // ── Summary ──
  console.log(`\n${'='.repeat(40)}`);
  console.log(`Results: ${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

runTests();
