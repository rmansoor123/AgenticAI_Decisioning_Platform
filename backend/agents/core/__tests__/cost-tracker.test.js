/**
 * Integration test for CostTracker.
 * Run with: node backend/agents/core/__tests__/cost-tracker.test.js
 */

import { getCostTracker } from '../cost-tracker.js';

async function runTests() {
  let passed = 0;
  let failed = 0;

  function assert(condition, message) {
    if (condition) { console.log(`  PASS: ${message}`); passed++; }
    else { console.error(`  FAIL: ${message}`); failed++; }
  }

  // Get singleton
  const tracker = getCostTracker();

  // ── Test 1: Singleton ──
  console.log('\nTest 1: Singleton pattern');
  {
    const a = getCostTracker();
    const b = getCostTracker();
    assert(a === b, 'same instance');
  }

  // ── Test 2: Record cost ──
  console.log('\nTest 2: Record cost');
  {
    const result = tracker.recordCost('TEST_AGENT', 'claude-sonnet-4-20250514', 1000, 500, 200);
    assert(typeof result.costUsd === 'number', 'costUsd is number');
    assert(result.costUsd > 0, 'costUsd is positive');
    // 1000 input at $3/M = 0.003, 500 output at $15/M = 0.0075, total = 0.0105
    assert(Math.abs(result.costUsd - 0.0105) < 0.0001, `cost is ~$0.0105 (got ${result.costUsd})`);
    assert(result.agentTotalUsd > 0, 'agent total is positive');
    assert(result.budgetRemaining === null, 'no budget set yet');
  }

  // ── Test 3: Agent cost breakdown ──
  console.log('\nTest 3: Agent cost breakdown');
  {
    const cost = tracker.getAgentCost('TEST_AGENT');
    assert(cost !== null, 'agent cost exists');
    assert(cost.agentId === 'TEST_AGENT', 'correct agentId');
    assert(cost.inputTokens === 1000, 'input tokens tracked');
    assert(cost.outputTokens === 500, 'output tokens tracked');
    assert(cost.totalTokens === 1500, 'total tokens correct');
    assert(cost.calls === 1, '1 call recorded');
    assert(cost.avgCostPerCall > 0, 'avg cost per call positive');
    assert(cost.budget === null, 'no budget set');
  }

  // ── Test 4: Multiple calls accumulate ──
  console.log('\nTest 4: Multiple calls accumulate');
  {
    tracker.recordCost('TEST_AGENT', 'claude-sonnet-4-20250514', 2000, 1000, 300);
    const cost = tracker.getAgentCost('TEST_AGENT');
    assert(cost.calls === 2, '2 calls total');
    assert(cost.inputTokens === 3000, '3000 input tokens total');
    assert(cost.outputTokens === 1500, '1500 output tokens total');
  }

  // ── Test 5: Different agents tracked separately ──
  console.log('\nTest 5: Different agents tracked separately');
  {
    tracker.recordCost('AGENT_B', 'claude-sonnet-4-20250514', 500, 250, 100);
    const costA = tracker.getAgentCost('TEST_AGENT');
    const costB = tracker.getAgentCost('AGENT_B');
    assert(costA.calls === 2, 'Agent A has 2 calls');
    assert(costB.calls === 1, 'Agent B has 1 call');
    assert(costA.totalCostUsd !== costB.totalCostUsd, 'different totals');
  }

  // ── Test 6: System cost ──
  console.log('\nTest 6: System cost');
  {
    const system = tracker.getSystemCost();
    assert(system.totalCalls === 3, '3 total calls');
    assert(system.totalCostUsd > 0, 'total cost positive');
    assert(system.agents.length === 2, '2 agents tracked');
    assert(system.topSpenders.length <= 5, 'top spenders limited');
    assert(system.avgCostPerCall > 0, 'avg cost per call positive');
  }

  // ── Test 7: Budget setting ──
  console.log('\nTest 7: Budget setting');
  {
    tracker.setBudget('BUDGET_AGENT', 1.00, 0.8);
    tracker.recordCost('BUDGET_AGENT', 'claude-sonnet-4-20250514', 1000, 500, 100);
    const cost = tracker.getAgentCost('BUDGET_AGENT');
    assert(cost.budget !== null, 'budget attached');
    assert(cost.budget.maxCostUsd === 1.00, 'max budget is $1.00');
    assert(cost.budget.remaining > 0, 'remaining is positive');
    assert(typeof cost.budget.usedPct === 'number', 'usedPct is number');
  }

  // ── Test 8: Budget warning alert ──
  console.log('\nTest 8: Budget warning alert');
  {
    tracker.setBudget('WARN_AGENT', 0.001, 0.5); // Very low budget
    tracker.recordCost('WARN_AGENT', 'claude-sonnet-4-20250514', 1000, 500, 100);
    // Cost is ~$0.0105, budget is $0.001, so it should be exceeded
    const cost = tracker.getAgentCost('WARN_AGENT');
    assert(cost.budget.remaining < 0, 'budget exceeded (negative remaining)');
    assert(cost.budget.usedPct > 100, 'over 100% used');
  }

  // ── Test 9: Different model pricing ──
  console.log('\nTest 9: Different model pricing');
  {
    const result1 = tracker.recordCost('MODEL_TEST', 'claude-sonnet-4-20250514', 10000, 5000, 500);
    // Reset for haiku
    const result2 = tracker.recordCost('MODEL_TEST_HAIKU', 'claude-haiku-4-5-20251001', 10000, 5000, 300);
    // Sonnet: 10000*3/1M + 5000*15/1M = 0.03 + 0.075 = 0.105
    // Haiku: 10000*0.8/1M + 5000*4/1M = 0.008 + 0.02 = 0.028
    assert(result1.costUsd > result2.costUsd, 'Sonnet costs more than Haiku');
    assert(Math.abs(result1.costUsd - 0.105) < 0.001, `Sonnet cost ~$0.105 (got ${result1.costUsd})`);
    assert(Math.abs(result2.costUsd - 0.028) < 0.001, `Haiku cost ~$0.028 (got ${result2.costUsd})`);
  }

  // ── Test 10: Unknown model uses default pricing ──
  console.log('\nTest 10: Unknown model uses default pricing');
  {
    const result = tracker.recordCost('UNKNOWN_MODEL', 'some-future-model', 1000, 500, 100);
    assert(result.costUsd > 0, 'cost calculated with default pricing');
  }

  // ── Test 11: Recent costs buffer ──
  console.log('\nTest 11: Recent costs buffer');
  {
    const recent = tracker.getRecentCosts(10);
    assert(Array.isArray(recent), 'recent is array');
    assert(recent.length > 0, 'has recent entries');
    assert(recent[0].agentId !== undefined, 'entries have agentId');
    assert(recent[0].costUsd !== undefined, 'entries have costUsd');
    assert(recent[0].timestamp !== undefined, 'entries have timestamp');
  }

  // ── Test 12: Pricing table ──
  console.log('\nTest 12: Pricing table');
  {
    const table = tracker.getPricingTable();
    assert(table['claude-sonnet-4-20250514'] !== undefined, 'has sonnet pricing');
    assert(table['claude-sonnet-4-20250514'].input === 3.00, 'sonnet input rate is $3/M');
    assert(table['claude-sonnet-4-20250514'].output === 15.00, 'sonnet output rate is $15/M');
    assert(table['_default'] !== undefined, 'has default pricing');
  }

  // ── Test 13: All agent costs ──
  console.log('\nTest 13: All agent costs');
  {
    const all = tracker.getAllAgentCosts();
    assert(Array.isArray(all), 'is array');
    assert(all.length >= 5, `has at least 5 agents (got ${all.length})`);
    for (const cost of all) {
      assert(cost.agentId !== undefined, `${cost.agentId} has agentId`);
      assert(cost.totalCostUsd >= 0, `${cost.agentId} has non-negative cost`);
    }
  }

  // ── Test 14: Null agent returns null ──
  console.log('\nTest 14: Nonexistent agent returns null');
  {
    const cost = tracker.getAgentCost('NONEXISTENT_AGENT');
    assert(cost === null, 'returns null');
  }

  // ── Test 15: Zero-token call ──
  console.log('\nTest 15: Zero-token call');
  {
    const result = tracker.recordCost('ZERO_AGENT', 'claude-sonnet-4-20250514', 0, 0, 50);
    assert(result.costUsd === 0, 'zero cost for zero tokens');
  }

  console.log(`\n${'='.repeat(40)}`);
  console.log(`Results: ${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
}

runTests();
