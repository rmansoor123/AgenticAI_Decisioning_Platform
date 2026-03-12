#!/usr/bin/env node
/**
 * Active Learning + Orchestrator Batch Execution Tests
 */

process.env.USE_LLM = 'false';
process.env.DB_BACKEND = 'sqlite';
process.env.MEMORY_BACKEND = 'sqlite';
process.env.CACHE_BACKEND = 'memory';
process.env.GRAPH_BACKEND = 'memory';
process.env.OBSERVABILITY_BACKEND = 'sqlite';

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (condition) {
    passed++;
    console.log(`  ✓ ${message}`);
  } else {
    failed++;
    console.error(`  ✗ ${message}`);
  }
}

console.log('\n══════════════════════════════════════════════════════');
console.log('  Active Learning + Orchestrator Batch Tests');
console.log('══════════════════════════════════════════════════════\n');

// ============================================================================
// Active Learning Manager Tests
// ============================================================================

console.log('--- Active Learning Manager ---');

const { getActiveLearningManager } = await import('../active-learning.js');

const alm = getActiveLearningManager();

assert(alm !== null, 'getActiveLearningManager() returns instance');
assert(typeof alm.start === 'function', 'has start() method');
assert(typeof alm.stop === 'function', 'has stop() method');
assert(typeof alm.getStats === 'function', 'has getStats() method');
assert(typeof alm.configure === 'function', 'has configure() method');

// Test singleton
const alm2 = getActiveLearningManager();
assert(alm === alm2, 'getActiveLearningManager() is singleton');

// Test default config
assert(alm.config.confidenceThreshold === 0.55, 'default confidence threshold is 0.55');
assert(alm.config.maxCasesPerAgentPerHour === 5, 'default max cases per agent per hour is 5');
assert(alm.config.triggers.lowConfidence === true, 'lowConfidence trigger enabled by default');
assert(alm.config.triggers.policyOverride === true, 'policyOverride trigger enabled by default');
assert(alm.config.triggers.reflectionRevision === true, 'reflectionRevision trigger enabled by default');
assert(alm.config.triggers.evalRegression === true, 'evalRegression trigger enabled by default');
assert(alm.config.triggers.judgeOverturn === true, 'judgeOverturn trigger enabled by default');
assert(alm.config.triggers.citationDowngrade === true, 'citationDowngrade trigger enabled by default');

// Test configure
alm.configure({ confidenceThreshold: 0.4, maxCasesPerAgentPerHour: 10 });
assert(alm.config.confidenceThreshold === 0.4, 'configure() updates confidenceThreshold');
assert(alm.config.maxCasesPerAgentPerHour === 10, 'configure() updates maxCasesPerAgentPerHour');

// Test configure triggers
alm.configure({ triggers: { lowConfidence: false } });
assert(alm.config.triggers.lowConfidence === false, 'configure() updates individual triggers');
assert(alm.config.triggers.policyOverride === true, 'other triggers unchanged');

// Reset for further tests
alm.configure({ confidenceThreshold: 0.55, maxCasesPerAgentPerHour: 5, triggers: { lowConfidence: true } });

// Test rate limiting
assert(alm._checkRateLimit('TEST_AGENT') === true, 'first call passes rate limit');
for (let i = 0; i < 4; i++) alm._checkRateLimit('TEST_AGENT');
assert(alm._checkRateLimit('TEST_AGENT') === false, 'sixth call blocked by rate limit (max 5/hour)');

// Different agent is not rate limited
assert(alm._checkRateLimit('OTHER_AGENT') === true, 'different agent not rate limited');

// Test case creation (direct)
const testCase = alm._createLearningCase({
  trigger: 'lowConfidence',
  agentId: 'TEST_AGENT_2',
  sellerId: 'SLR-TEST',
  decision: 'REVIEW',
  confidence: 0.3,
  reasoning: 'Test low confidence case',
  riskScore: 45
});
assert(testCase !== null, '_createLearningCase() returns case object');
assert(testCase.checkpoint === 'ACTIVE_LEARNING', 'case has ACTIVE_LEARNING checkpoint');
assert(testCase.activeLearningTrigger === 'lowConfidence', 'case has correct trigger');
assert(testCase.agentId === 'TEST_AGENT_2', 'case has correct agentId');
assert(testCase.sellerId === 'SLR-TEST', 'case has correct sellerId');

// Test stats
const stats = alm.getStats();
assert(stats.isRunning === false, 'not running before start()');
assert(stats.stats.casesCreated >= 1, 'casesCreated incremented');
assert(stats.stats.byTrigger.lowConfidence >= 1, 'lowConfidence trigger count incremented');

// Test start/stop
alm.start();
const stats2 = alm.getStats();
// May or may not be running depending on event bus availability
assert(typeof stats2.isRunning === 'boolean', 'isRunning is boolean after start()');
alm.stop();
assert(alm.isRunning === false, 'isRunning false after stop()');

// ============================================================================
// Orchestrator Batch Execution Tests
// ============================================================================

console.log('\n--- Orchestrator Batch Execution ---');

const { orchestrator } = await import('../agent-orchestrator.js');

assert(typeof orchestrator.executeBatch === 'function', 'orchestrator has executeBatch() method');
assert(typeof orchestrator.fanOut === 'function', 'orchestrator has fanOut() method');

// Create mock agents for batch testing
class MockAgent {
  constructor(id, delay = 10, shouldFail = false) {
    this.agentId = id;
    this.name = `Mock ${id}`;
    this.role = 'mock';
    this.capabilities = ['mock'];
    this.delay = delay;
    this.shouldFail = shouldFail;
  }
  async reason(input, context) {
    await new Promise(r => setTimeout(r, this.delay));
    if (this.shouldFail) throw new Error(`Mock failure from ${this.agentId}`);
    return { result: { decision: 'APPROVE', agentId: this.agentId, input }, success: true };
  }
  getState() { return { agentId: this.agentId, status: 'IDLE' }; }
}

// Register mock agents
const mockA = new MockAgent('MOCK_A', 10);
const mockB = new MockAgent('MOCK_B', 20);
const mockC = new MockAgent('MOCK_C', 10, true); // Will fail
orchestrator.registerAgent(mockA);
orchestrator.registerAgent(mockB);
orchestrator.registerAgent(mockC);

// Test executeBatch — successful batch
const batchResult = await orchestrator.executeBatch([
  { agentId: 'MOCK_A', input: { type: 'test', id: 1 } },
  { agentId: 'MOCK_B', input: { type: 'test', id: 2 } }
], { concurrency: 2 });

assert(batchResult.batchId !== undefined, 'executeBatch returns batchId');
assert(batchResult.results.length === 2, 'executeBatch returns 2 results');
assert(batchResult.results[0].status === 'COMPLETED', 'first task completed');
assert(batchResult.results[1].status === 'COMPLETED', 'second task completed');
assert(batchResult.results[0].durationMs >= 0, 'durationMs tracked for first task');
assert(batchResult.results[1].durationMs >= 0, 'durationMs tracked for second task');

// Test executeBatch — with failure
const batchResult2 = await orchestrator.executeBatch([
  { agentId: 'MOCK_A', input: { type: 'test' } },
  { agentId: 'MOCK_C', input: { type: 'test' } }, // Will fail
  { agentId: 'MOCK_B', input: { type: 'test' } }
], { concurrency: 3 });

assert(batchResult2.results.length === 3, 'batch with failure returns all 3 results');
assert(batchResult2.results[0].status === 'COMPLETED', 'MOCK_A completed despite MOCK_C failure');
assert(batchResult2.results[1].status === 'FAILED', 'MOCK_C failed as expected');
assert(batchResult2.results[1].error.includes('Mock failure'), 'error message preserved');
assert(batchResult2.results[2].status === 'COMPLETED', 'MOCK_B completed despite MOCK_C failure');

// Test executeBatch — agent not found
const batchResult3 = await orchestrator.executeBatch([
  { agentId: 'NONEXISTENT', input: {} }
]);
assert(batchResult3.results[0].status === 'FAILED', 'nonexistent agent returns FAILED');
assert(batchResult3.results[0].error.includes('Agent not found'), 'agent not found error');

// Test fanOut
const fanOutResult = await orchestrator.fanOut(
  ['MOCK_A', 'MOCK_B'],
  { type: 'cross_check', sellerId: 'SLR-TEST' },
  { concurrency: 2 }
);
assert(fanOutResult.batchId !== undefined, 'fanOut returns batchId');
assert(fanOutResult.results.length === 2, 'fanOut sends to both agents');
assert(fanOutResult.results.every(r => r.status === 'COMPLETED'), 'all fanOut tasks completed');

// Test executeBatch — timeout
const slowAgent = new MockAgent('MOCK_SLOW', 5000); // 5s delay
orchestrator.registerAgent(slowAgent);

const timeoutResult = await orchestrator.executeBatch([
  { agentId: 'MOCK_SLOW', input: {} }
], { timeoutMs: 50 }); // 50ms timeout
assert(timeoutResult.results[0].status === 'FAILED', 'slow agent times out');
assert(timeoutResult.results[0].error.includes('Timeout'), 'timeout error message');

// Test executeBatch — stopOnError
const stopResult = await orchestrator.executeBatch([
  { agentId: 'MOCK_C', input: {} }, // Fails first
  { agentId: 'MOCK_A', input: {} }
], { concurrency: 1, stopOnError: true });
// With concurrency=1, MOCK_C runs first and fails, MOCK_A should be skipped
assert(stopResult.results[0].status === 'FAILED', 'first task failed');
assert(stopResult.results[1].status === 'SKIPPED', 'second task skipped after stopOnError');

// Cleanup
orchestrator.unregisterAgent('MOCK_A');
orchestrator.unregisterAgent('MOCK_B');
orchestrator.unregisterAgent('MOCK_C');
orchestrator.unregisterAgent('MOCK_SLOW');

// ============================================================================
// Summary
// ============================================================================

console.log('\n══════════════════════════════════════════════════════');
console.log(`  Results: ${passed} passed, ${failed} failed`);
console.log('══════════════════════════════════════════════════════\n');

process.exit(failed > 0 ? 1 : 0);
